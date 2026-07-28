import { Inject, Injectable, Logger } from '@nestjs/common';
import { ProficiencyLevel } from '../../shared';
import {
  AI_PROVIDER,
  AiAnalysis,
  AiProvider,
  AiProviderName,
  CapabilityAssessmentResult,
  CapabilityAssessmentState,
  parseJsonObject,
} from './ai-provider';
import type { FederatedOpportunity } from '../matching/opportunity-search.types';
import type { NoMatchAiGuide } from '../matching/no-match-resolution.types';

export type ConversationIntent =
  'submit_problem' | 'register_skill' | 'general_question' | 'unclear';

export interface ConversationHistoryItem {
  role: 'user' | 'assistant' | 'system';
  text?: string;
  capabilityAssessment?: CapabilityAssessmentState;
}

export interface IntentAnalysisResult {
  intent: ConversationIntent;
  confidence: number;
  extractedEntities: Record<string, unknown>;
  missingFields: string[];
  clarifyingQuestion?: string;
  assistantReply: string;
  problemAnalysis?: AiAnalysis;
  capabilityAssessment?: CapabilityAssessmentState;
  quickReplies?: string[];
  countdownSeconds?: number;
  provider: AiProviderName | 'fallback';
}

export interface ConversationAnalysisInput {
  conversationType: 'problem' | 'capability' | 'inquiry';
  message: string;
  history: ConversationHistoryItem[];
}

export type ResolveAssistantRoute =
  'problem' | 'capability' | 'opportunity' | 'project' | 'general';

export interface ResolveAssistantRouting {
  route: ResolveAssistantRoute;
  confidence: number;
  query: string;
  reason: string;
  provider: AiProviderName | 'fallback';
}

export interface ProposalDraftInput {
  problem: string;
  requiredSkills: string[];
  matchExplanation: string[];
  teamResponsibilities: string[];
  userInstruction: string;
  currentDraft?: string;
}

export interface AiProposalDraft {
  summary: string;
  scope: string;
  activities: Array<{ title: string; description: string }>;
  deliverables: Array<{
    title: string;
    description: string;
    dueOffsetDays: number;
  }>;
  acceptanceCriteria: string[];
  estimatedDurationDays: number;
  conditions: string[];
  assumptions: string[];
  suggestedPrice: { amount: number; currency: string };
}

export interface SkillCoverageCandidateInput {
  id: string;
  skills: string[];
}

export interface AiSkillCoverage {
  coveredSkills: string[];
  missingSkills: string[];
  candidateMatches: Array<{
    id: string;
    matchingSkills: string[];
    score: number;
  }>;
}

@Injectable()
export class AiEngineService {
  private readonly logger = new Logger(AiEngineService.name);
  private static readonly QUESTION_SECONDS = 15;
  private static readonly TIMEOUT_MESSAGE = 'Tiempo agotado';
  private static readonly CREATE_PORTFOLIO_REPLY = 'Sí, crear mi portafolio';
  private static readonly USE_EXTERNAL_LINK_REPLY =
    'No, usaré un enlace propio';

  constructor(@Inject(AI_PROVIDER) private readonly provider: AiProvider) {}

  get providerName(): AiProviderName {
    return this.provider.name;
  }

  analyzeProblem(description: string): Promise<AiAnalysis> {
    const prompt = [
      'Analiza el siguiente problema para un marketplace de soluciones.',
      'Devuelve únicamente JSON con: category (string), urgencyLevel (Low|Medium|High|Critical),',
      'requiredSkills (string array) y summary (string breve en español).',
      `Problema: ${description.trim()}`,
    ].join('\n');
    return this.provider.analyze(prompt);
  }

  async analyzeSkillCoverage(
    requiredSkills: string[],
    teamSkills: string[],
    candidates: SkillCoverageCandidateInput[],
  ): Promise<AiSkillCoverage> {
    const fallback = this.fallbackSkillCoverage(
      requiredSkills,
      teamSkills,
      candidates,
    );
    if (this.provider.name === 'disabled') return fallback;
    try {
      const raw = await this.provider.generate(
        [
          'Analiza cobertura semántica de capacidades para formar un equipo de proyecto.',
          'Reconoce equivalencias y sinónimos técnicos en español e inglés, por ejemplo depuración, debugging, diagnóstico y troubleshooting.',
          'Devuelve sólo JSON con este esquema exacto:',
          '{"coveredSkills":["string"],"missingSkills":["string"],"candidateMatches":[{"id":"string","matchingSkills":["string"],"score":number}]}',
          'coveredSkills y missingSkills deben usar los nombres originales de requiredSkills.',
          'score debe estar entre 0 y 100 y matchingSkills debe listar capacidades originales del candidato que cubren requisitos.',
          `Capacidades requeridas: ${JSON.stringify(requiredSkills)}`,
          `Capacidades del equipo actual: ${JSON.stringify(teamSkills)}`,
          `Candidatos: ${JSON.stringify(candidates)}`,
        ].join('\n'),
        { complex: true },
      );
      const value = parseJsonObject(raw);
      const coveredSkills = Array.isArray(value.coveredSkills)
        ? value.coveredSkills.filter(
            (skill): skill is string => typeof skill === 'string',
          )
        : fallback.coveredSkills;
      const missingSkills = Array.isArray(value.missingSkills)
        ? value.missingSkills.filter(
            (skill): skill is string => typeof skill === 'string',
          )
        : fallback.missingSkills;
      const candidateMatches = Array.isArray(value.candidateMatches)
        ? value.candidateMatches.flatMap((item) => {
            if (!item || typeof item !== 'object') return [];
            const candidate = item as Record<string, unknown>;
            if (
              typeof candidate.id !== 'string' ||
              !Array.isArray(candidate.matchingSkills)
            )
              return [];
            return [
              {
                id: candidate.id,
                matchingSkills: candidate.matchingSkills.filter(
                  (skill): skill is string => typeof skill === 'string',
                ),
                score:
                  typeof candidate.score === 'number'
                    ? Math.min(100, Math.max(0, candidate.score))
                    : 0,
              },
            ];
          })
        : fallback.candidateMatches;
      return { coveredSkills, missingSkills, candidateMatches };
    } catch (error) {
      this.logProviderFallback('team skill coverage analysis', error);
      return fallback;
    }
  }

  async generateNoMatchGuide(
    problemDescription: string,
    requiredSkills: string[],
  ): Promise<NoMatchAiGuide> {
    const disclaimer =
      'Orientación general generada por IA. No sustituye la evaluación de un profesional calificado. No realices acciones que puedan poner en riesgo a personas, bienes, sistemas críticos o incumplir normas; ante peligro inmediato, contacta a emergencias o a un profesional autorizado.';
    const fallback: NoMatchAiGuide = {
      title: 'Plan inicial seguro mientras encuentras ayuda profesional',
      steps: [
        'Detén cualquier actividad que pueda aumentar el daño y mantén a las personas alejadas del área afectada.',
        'Documenta el problema con notas, fechas y fotografías sólo si hacerlo es seguro.',
        `Prepara una descripción breve para solicitar ayuda e incluye estas capacidades: ${requiredSkills.join(', ') || 'diagnóstico profesional'}.`,
        'Consulta profesionales acreditados, solicita referencias y compara alcance, tiempos y condiciones antes de contratar.',
      ],
      safetyWarnings: [
        'No desmontes, repares ni manipules instalaciones, equipos o materiales peligrosos sin capacitación y autorización.',
      ],
      disclaimer,
      provider: 'fallback',
    };
    const riskContext = `${problemDescription} ${requiredSkills.join(' ')}`;
    const dangerous =
      /chisp|electric|volt|cable|gas|combust|incend|fuego|estructur|techo|freno|m[eé]dic|salud|s[ií]ntoma|medicamento|dosis|sangre|qu[ií]mic|t[oó]xic|presi[oó]n|arma|explosi|inundaci[oó]n|legal|financ|inversi[oó]n|deuda/i.test(
        riskContext,
      );
    if (dangerous || this.provider.name === 'disabled') return fallback;
    try {
      const raw = await this.provider.generate(
        [
          'Genera orientación inicial conservadora en español para el dueño de un problema cuando no hay un solucionador humano disponible.',
          'No des instrucciones peligrosas, no indiques desmontar ni reparar instalaciones, y no sustituyas asesoría profesional.',
          'Devuelve sólo JSON: {"title":"string","steps":["string"],"safetyWarnings":["string"]}.',
          'Incluye entre 2 y 6 pasos prácticos de bajo riesgo: documentar, contener sólo si es seguro, recopilar información y buscar profesionales.',
          `Problema: ${problemDescription}`,
          `Capacidades requeridas: ${JSON.stringify(requiredSkills)}`,
        ].join('\n'),
      );
      const value = parseJsonObject(raw);
      const steps = Array.isArray(value.steps)
        ? value.steps.filter(
            (step): step is string =>
              typeof step === 'string' && step.trim().length > 0,
          )
        : [];
      const safetyWarnings = Array.isArray(value.safetyWarnings)
        ? value.safetyWarnings.filter(
            (warning): warning is string =>
              typeof warning === 'string' && warning.trim().length > 0,
          )
        : [];
      const unsafeGeneratedStep = steps.some((step) =>
        /\b(desmont|repar|manipul|conect|desconect|cort|perfor|instal|sustitu|reemplaz|mezcl|aplic|inger|tom|dosis|medic|puente|desactiv|anul|retir|abr)/i.test(
          step,
        ),
      );
      if (
        typeof value.title !== 'string' ||
        !value.title.trim() ||
        steps.length < 2 ||
        unsafeGeneratedStep
      ) {
        throw new Error(
          'AI provider returned an invalid or unsafe no-match guide',
        );
      }
      return {
        title: value.title.trim(),
        steps: steps.slice(0, 6).map((step) => step.trim()),
        safetyWarnings: (safetyWarnings.length
          ? safetyWarnings
          : fallback.safetyWarnings
        ).map((warning) => warning.trim()),
        disclaimer,
        provider: this.provider.name,
      };
    } catch (error) {
      this.logProviderFallback('no-match guidance', error);
      return fallback;
    }
  }

  async generateProposalDraft(
    input: ProposalDraftInput,
  ): Promise<AiProposalDraft> {
    const fallback = this.fallbackProposalDraft(input);
    if (this.provider.name === 'disabled') return fallback;
    try {
      const raw = await this.provider.generate(
        [
          'Genera una propuesta profesional y realista para un marketplace de soluciones.',
          'Usa exclusivamente los datos proporcionados y escribe todo en español.',
          'Devuelve sólo JSON con este esquema exacto:',
          '{"summary":"string","scope":"string","activities":[{"title":"string","description":"string"}],"deliverables":[{"title":"string","description":"string","dueOffsetDays":number}],"acceptanceCriteria":["string"],"estimatedDurationDays":number,"conditions":["string"],"assumptions":["string"],"suggestedPrice":{"amount":number,"currency":"PEN|USD|EUR"}}',
          'Incluye entre 2 y 6 actividades y entre 1 y 5 entregables. Los días de entrega deben ser enteros positivos, crecientes y no superar la duración estimada.',
          'La instrucción del solucionador tiene prioridad para alcance, duración, precio, condiciones y ajustes.',
          `Problema: ${input.problem}`,
          `Capacidades requeridas: ${input.requiredSkills.join(', ') || 'No especificadas'}`,
          `Razones del match: ${input.matchExplanation.join('; ') || 'Sin detalle'}`,
          `Responsabilidades del equipo: ${input.teamResponsibilities.join('; ') || 'Propuesta individual'}`,
          `Instrucción del solucionador: ${input.userInstruction}`,
          ...(input.currentDraft
            ? [`Borrador actual que debes ajustar: ${input.currentDraft}`]
            : []),
        ].join('\n'),
        { complex: true },
      );
      return this.parseProposalDraft(parseJsonObject(raw), fallback);
    } catch (error) {
      this.logProviderFallback('proposal draft generation', error);
      return fallback;
    }
  }

  async translateOpportunityQueryToEnglish(query: string): Promise<string> {
    if (this.provider.name === 'disabled') {
      return this.fallbackEnglishOpportunityQuery(query);
    }
    try {
      const raw = await this.provider.generate(
        [
          'Traduce una consulta de búsqueda laboral al inglés.',
          'Conserva nombres de tecnologías, marcas y lenguajes de programación.',
          'Devuelve sólo JSON con query (string breve, sin explicaciones).',
          `Consulta: ${query}`,
        ].join('\n'),
      );
      const value = parseJsonObject(raw);
      if (typeof value.query !== 'string' || !value.query.trim()) {
        throw new Error('Invalid translated opportunity query');
      }
      return value.query.trim();
    } catch (error) {
      this.logProviderFallback('opportunity query translation', error);
      return this.fallbackEnglishOpportunityQuery(query);
    }
  }

  async translateOpportunitiesToSpanish(
    opportunities: FederatedOpportunity[],
  ): Promise<FederatedOpportunity[]> {
    if (!opportunities.length || this.provider.name === 'disabled') {
      return opportunities;
    }

    const translated: FederatedOpportunity[] = [];
    const chunkSize = 3;

    for (let index = 0; index < opportunities.length; index += chunkSize) {
      const chunk = opportunities.slice(index, index + chunkSize);
      try {
        translated.push(...(await this.translateOpportunityChunk(chunk)));
      } catch (error) {
        this.logProviderFallback('opportunity result translation', error);
        for (const opportunity of chunk) {
          try {
            translated.push(
              ...(await this.translateOpportunityChunk([opportunity])),
            );
          } catch (retryError) {
            this.logProviderFallback(
              `opportunity result translation (${opportunity.id})`,
              retryError,
            );
            translated.push(opportunity);
          }
        }
      }
    }

    const completed: FederatedOpportunity[] = [];
    for (const opportunity of translated) {
      if (opportunity.translatedToSpanish) {
        completed.push(opportunity);
        continue;
      }
      try {
        completed.push(
          ...(await this.translateOpportunityChunk([opportunity])),
        );
      } catch (error) {
        this.logProviderFallback(
          `opportunity result translation retry (${opportunity.id})`,
          error,
        );
        completed.push(opportunity);
      }
    }

    return completed;
  }

  private async translateOpportunityChunk(
    opportunities: FederatedOpportunity[],
  ): Promise<FederatedOpportunity[]> {
    try {
      const raw = await this.provider.generate(
        [
          'Traduce al español títulos y resúmenes de oportunidades laborales.',
          'Cada title y summary debe quedar en español natural; no copies texto en inglés sin traducir.',
          'Traduce también términos laborales comunes como Engineer, Developer, About, Senior, Remote y Full Stack.',
          'Conserva sin cambios únicamente nombres propios, empresas, tecnologías, monedas y cifras.',
          'No agregues ni elimines información.',
          'Devuelve sólo JSON con items, un array de objetos {id,title,summary}.',
          `Oportunidades: ${JSON.stringify(
            opportunities.map((item) => ({
              id: item.id,
              title: item.title,
              summary: item.summary,
            })),
          )}`,
        ].join('\n'),
      );
      const value = parseJsonObject(raw);
      if (!Array.isArray(value.items)) {
        throw new Error('Invalid opportunity translation response');
      }
      const translations = new Map(
        value.items.flatMap((item) => {
          if (
            !item ||
            typeof item !== 'object' ||
            typeof (item as Record<string, unknown>).id !== 'string' ||
            typeof (item as Record<string, unknown>).title !== 'string' ||
            typeof (item as Record<string, unknown>).summary !== 'string'
          ) {
            return [];
          }
          const translated = item as {
            id: string;
            title: string;
            summary: string;
          };
          return [[translated.id, translated] as const];
        }),
      );
      return opportunities.map((opportunity) => {
        const translation = translations.get(opportunity.id);
        if (!translation) {
          return opportunity;
        }
        const title = translation.title.trim();
        const summary = translation.summary.trim();
        return {
          ...opportunity,
          title,
          summary,
          translatedToSpanish:
            title !== opportunity.title || summary !== opportunity.summary,
        };
      });
    } catch (error) {
      throw error;
    }
  }

  async analyzeConversation(
    input: ConversationAnalysisInput,
  ): Promise<IntentAnalysisResult> {
    const userText = [
      ...input.history,
      { role: 'user' as const, text: input.message },
    ]
      .filter((item) => item.role === 'user' && item.text?.trim())
      .map((item) => item.text?.trim())
      .join('\n');

    if (input.conversationType === 'problem') {
      return this.analyzeProblemConversation(userText);
    }
    if (input.conversationType === 'capability') {
      return this.analyzeCapabilityConversation(input, userText);
    }
    return this.answerInquiry(input);
  }

  async routeResolveRequest(
    input: ConversationAnalysisInput,
  ): Promise<ResolveAssistantRouting> {
    const fallback = this.fallbackResolveRoute(input.message);
    if (this.provider.name === 'disabled') return fallback;

    try {
      const raw = await this.provider.generate(
        [
          'Clasifica la solicitud para el asistente de Resolve.',
          'Resolve permite: publicar un problema para encontrar solucionadores; ofrecer y validar una capacidad; explorar oportunidades laborales; consultar proyectos propios activos; o responder preguntas generales.',
          'Rutas válidas: problem, capability, opportunity, project, general.',
          'Usa project sólo para consultar estado, tareas, entregables, pagos, participantes o avance de proyectos propios.',
          'Usa opportunity para buscar empleos, trabajos, vacantes o proyectos a los que el usuario desea postular.',
          'Usa problem cuando el usuario necesita resolver una necesidad o encontrar personas que la solucionen.',
          'Usa capability cuando el usuario desea ofrecer, registrar o validar sus habilidades.',
          'Devuelve sólo JSON con route, confidence (0 a 1), query y reason.',
          `Historial: ${JSON.stringify(input.history)}`,
          `Mensaje actual: ${input.message}`,
        ].join('\n'),
      );
      const value = parseJsonObject(raw);
      const validRoutes: ResolveAssistantRoute[] = [
        'problem',
        'capability',
        'opportunity',
        'project',
        'general',
      ];
      if (
        typeof value.route !== 'string' ||
        !validRoutes.includes(value.route as ResolveAssistantRoute)
      ) {
        throw new Error('Invalid Resolve assistant route');
      }
      const confidence =
        typeof value.confidence === 'number'
          ? Math.max(0, Math.min(1, value.confidence))
          : 0.8;
      return {
        route: value.route as ResolveAssistantRoute,
        confidence,
        query:
          typeof value.query === 'string' && value.query.trim()
            ? value.query.trim()
            : input.message.trim(),
        reason:
          typeof value.reason === 'string'
            ? value.reason.trim()
            : 'Solicitud clasificada por el asistente de Resolve.',
        provider: this.provider.name,
      };
    } catch (error) {
      this.logProviderFallback('Resolve assistant routing', error);
      return fallback;
    }
  }

  private async analyzeProblemConversation(
    description: string,
  ): Promise<IntentAnalysisResult> {
    if (!this.hasUsefulDescription(description)) {
      const question =
        '¿Qué está ocurriendo, dónde sucede y qué resultado necesitas obtener?';
      return {
        intent: 'submit_problem',
        confidence: 0.75,
        extractedEntities: { description },
        missingFields: ['description'],
        clarifyingQuestion: question,
        assistantReply: question,
        provider:
          this.provider.name === 'disabled' ? 'fallback' : this.provider.name,
      };
    }

    let analysis: AiAnalysis;
    let provider: IntentAnalysisResult['provider'] = this.provider.name;
    try {
      analysis = await this.analyzeProblem(description);
    } catch (error) {
      this.logProviderFallback('problem analysis', error);
      analysis = this.fallbackProblemAnalysis(description);
      provider = 'fallback';
    }
    return {
      intent: 'submit_problem',
      confidence: provider === 'fallback' ? 0.72 : 0.95,
      extractedEntities: {
        description,
        category: analysis.category,
        urgencyLevel: analysis.urgencyLevel,
        requiredSkills: analysis.requiredSkills,
      },
      missingFields: [],
      assistantReply: `${analysis.summary} Preparé una tarjeta con el diagnóstico. Revísala y confirma antes de publicar el problema.`,
      problemAnalysis: analysis,
      provider,
    };
  }

  private async analyzeCapabilityConversation(
    input: ConversationAnalysisInput,
    userText: string,
  ): Promise<IntentAnalysisResult> {
    const latestAssessment = [...input.history]
      .reverse()
      .find((item) => item.capabilityAssessment)?.capabilityAssessment;
    let provider: IntentAnalysisResult['provider'] = this.provider.name;
    if (!latestAssessment) {
      if (!this.hasUsefulCapability(userText)) {
        const question =
          '¿Qué capacidad concreta quieres ofrecer? Incluye la tecnología, oficio o especialidad principal.';
        return {
          intent: 'register_skill',
          confidence: 0.75,
          extractedEntities: {},
          missingFields: ['capability'],
          clarifyingQuestion: question,
          assistantReply: question,
          provider:
            this.provider.name === 'disabled' ? 'fallback' : this.provider.name,
        };
      }
      let assessment: CapabilityAssessmentState;
      try {
        assessment =
          this.provider.name === 'disabled'
            ? this.fallbackAssessmentStart(userText)
            : await this.startCapabilityAssessment(userText);
      } catch (error) {
        this.logProviderFallback('capability questionnaire generation', error);
        assessment = this.fallbackAssessmentStart(userText);
        provider = 'fallback';
      }
      if (this.provider.name === 'disabled') provider = 'fallback';
      const startedAssessment = {
        ...assessment,
        currentQuestionStartedAt: new Date().toISOString(),
      };
      const question = `Pregunta 1 de 3: ${assessment.questions[0].prompt}`;
      return {
        intent: 'register_skill',
        confidence: provider === 'fallback' ? 0.72 : 0.95,
        extractedEntities: {
          capability: assessment.capability,
          tags: assessment.tags,
        },
        missingFields: ['assessmentAnswers', 'evidenceLinks'],
        clarifyingQuestion: question,
        assistantReply: `Evaluaremos tu capacidad en ${assessment.capability} mediante tres preguntas de opción múltiple. Tendrás 15 segundos para responder cada una. ${question}`,
        capabilityAssessment: startedAssessment,
        quickReplies: assessment.questions[0].options,
        countdownSeconds: AiEngineService.QUESTION_SECONDS,
        provider,
      };
    }

    let assessment = this.normalizeAssessment(latestAssessment);
    if (!assessment.result) {
      const questionIndex = assessment.answers.length;
      const currentQuestion = assessment.questions[questionIndex];
      const selectedOption = input.message.trim();
      const elapsedMilliseconds = assessment.currentQuestionStartedAt
        ? Date.now() - Date.parse(assessment.currentQuestionStartedAt)
        : Number.POSITIVE_INFINITY;
      const timedOut =
        selectedOption === AiEngineService.TIMEOUT_MESSAGE ||
        elapsedMilliseconds > AiEngineService.QUESTION_SECONDS * 1000;
      if (!timedOut && !currentQuestion.options.includes(selectedOption)) {
        const question = `Pregunta ${questionIndex + 1} de 3: ${currentQuestion.prompt}`;
        return {
          intent: 'register_skill',
          confidence: 0.9,
          extractedEntities: {
            capability: assessment.capability,
            tags: assessment.tags,
          },
          missingFields: ['assessmentAnswers', 'evidenceLinks'],
          clarifyingQuestion: question,
          assistantReply:
            'Selecciona una de las opciones disponibles para responder la evaluación.',
          capabilityAssessment: assessment,
          quickReplies: currentQuestion.options,
          countdownSeconds: AiEngineService.QUESTION_SECONDS,
          provider:
            this.provider.name === 'disabled' ? 'fallback' : this.provider.name,
        };
      }
      assessment.answers.push({
        questionIndex,
        selectedOption: timedOut
          ? AiEngineService.TIMEOUT_MESSAGE
          : selectedOption,
        answeredAt: new Date().toISOString(),
        timedOut,
      });
      if (assessment.answers.length < 3) {
        const questionNumber = assessment.answers.length + 1;
        const nextQuestion = assessment.questions[questionNumber - 1];
        assessment.currentQuestionStartedAt = new Date().toISOString();
        const question = `Pregunta ${questionNumber} de 3: ${nextQuestion.prompt}`;
        return {
          intent: 'register_skill',
          confidence: 0.95,
          extractedEntities: {
            capability: assessment.capability,
            tags: assessment.tags,
          },
          missingFields: ['assessmentAnswers', 'evidenceLinks'],
          clarifyingQuestion: question,
          assistantReply: question,
          capabilityAssessment: assessment,
          quickReplies: nextQuestion.options,
          countdownSeconds: AiEngineService.QUESTION_SECONDS,
          provider:
            this.provider.name === 'disabled' ? 'fallback' : this.provider.name,
        };
      }
      try {
        assessment = {
          ...assessment,
          result:
            this.provider.name === 'disabled'
              ? this.fallbackAssessmentResult(assessment)
              : await this.evaluateCapabilityAssessment(assessment),
        };
      } catch (error) {
        this.logProviderFallback('capability questionnaire evaluation', error);
        assessment = {
          ...assessment,
          result: this.fallbackAssessmentResult(assessment),
        };
        provider = 'fallback';
      }
      if (this.provider.name === 'disabled') provider = 'fallback';
      assessment = {
        ...assessment,
        stage: 'evidence_choice',
        currentQuestionStartedAt: undefined,
      };
      const question =
        'Evaluación completada. ¿Deseas que Resolve cree un portafolio público de esta capacidad usando tus respuestas como evidencia inicial?';
      return {
        intent: 'register_skill',
        confidence: provider === 'fallback' ? 0.75 : 0.96,
        extractedEntities: {
          capability: assessment.capability,
          tags: assessment.tags,
          proficiencyLevel: assessment.result?.suggestedLevel,
          evidenceLinks: [],
          assessment: assessment.result,
        },
        missingFields: ['evidenceLinks'],
        clarifyingQuestion: question,
        assistantReply:
          `${assessment.result?.summary ?? ''} ${question}`.trim(),
        capabilityAssessment: assessment,
        quickReplies: [
          AiEngineService.CREATE_PORTFOLIO_REPLY,
          AiEngineService.USE_EXTERNAL_LINK_REPLY,
        ],
        provider,
      };
    }

    const currentMessage = input.message.trim();
    const degraded = String(provider) === 'fallback';
    if (
      assessment.stage === 'evidence_choice' &&
      this.isPortfolioAcceptance(currentMessage)
    ) {
      return {
        intent: 'register_skill',
        confidence: 0.98,
        extractedEntities: {
          capability: assessment.capability,
          tags: assessment.tags,
          proficiencyLevel: assessment.result?.suggestedLevel,
          evidenceLinks: [],
          assessment: assessment.result,
          portfolioRequested: true,
        },
        missingFields: ['portfolioCreation'],
        assistantReply:
          'Crearé el portafolio público con el resultado y las respuestas de esta evaluación.',
        capabilityAssessment: assessment,
        provider,
      };
    }
    if (
      assessment.stage === 'evidence_choice' &&
      this.isExternalEvidenceChoice(currentMessage)
    ) {
      assessment = { ...assessment, stage: 'external_evidence' };
      const question =
        'Comparte el enlace público a tu certificación, portafolio o trabajo.';
      return {
        intent: 'register_skill',
        confidence: 0.95,
        extractedEntities: {
          capability: assessment.capability,
          tags: assessment.tags,
          proficiencyLevel: assessment.result?.suggestedLevel,
          evidenceLinks: [],
          assessment: assessment.result,
        },
        missingFields: ['evidenceLinks'],
        clarifyingQuestion: question,
        assistantReply: question,
        capabilityAssessment: assessment,
        provider,
      };
    }

    const evidenceLinks = this.extractUrls(currentMessage);
    if (!evidenceLinks.length) {
      const offeringPortfolio = assessment.stage === 'evidence_choice';
      const question = offeringPortfolio
        ? 'Elige una opción: puedo crear tu portafolio público o puedes aportar un enlace propio.'
        : 'Comparte un enlace público válido. Si prefieres que Resolve cree el portafolio, responde “Sí, crear mi portafolio”.';
      return {
        intent: 'register_skill',
        confidence: degraded ? 0.75 : 0.96,
        extractedEntities: {
          capability: assessment.capability,
          tags: assessment.tags,
          proficiencyLevel: assessment.result?.suggestedLevel,
          evidenceLinks: [],
          assessment: assessment.result,
        },
        missingFields: ['evidenceLinks'],
        clarifyingQuestion: question,
        assistantReply:
          `${assessment.result?.summary ?? ''} ${question}`.trim(),
        capabilityAssessment: assessment,
        ...(offeringPortfolio
          ? {
              quickReplies: [
                AiEngineService.CREATE_PORTFOLIO_REPLY,
                AiEngineService.USE_EXTERNAL_LINK_REPLY,
              ],
            }
          : {}),
        provider,
      };
    }

    assessment = { ...assessment, stage: 'complete' };
    return {
      intent: 'register_skill',
      confidence: degraded ? 0.78 : 0.97,
      extractedEntities: {
        capability: assessment.capability,
        tags: assessment.tags,
        proficiencyLevel: assessment.result?.suggestedLevel,
        evidenceLinks,
        assessment: assessment.result,
      },
      missingFields: [],
      assistantReply: `${assessment.result?.summary ?? 'Evaluación completada.'} Preparé tu Skill Card con nivel sugerido y evidencia. Revísala y confirma antes de registrarla.`,
      capabilityAssessment: assessment,
      provider,
    };
  }

  private async answerInquiry(
    input: ConversationAnalysisInput,
  ): Promise<IntentAnalysisResult> {
    let answer =
      'Puedo ayudarte a resolver un problema, ofrecer y validar una capacidad, explorar oportunidades o consultar tus proyectos activos. Cuéntame qué necesitas y elegiré el flujo adecuado.';
    let provider: IntentAnalysisResult['provider'] = 'fallback';
    if (this.provider.name !== 'disabled') {
      try {
        const raw = await this.provider.generate(
          [
            'Responde como asistente de Resolve, un marketplace que conecta problemas con solucionadores.',
            'Tus funciones son: resolver problemas, ofrecer capacidades, explorar oportunidades y consultar proyectos propios.',
            'Si la solicitud requiere ejecutar una de esas funciones, explica brevemente qué información necesitas para continuar.',
            'Sé breve, útil y responde en español. No afirmes haber ejecutado acciones.',
            'Devuelve sólo JSON con la propiedad answer (string).',
            `Historial: ${JSON.stringify(input.history)}`,
            `Mensaje actual: ${input.message}`,
          ].join('\n'),
        );
        const value = parseJsonObject(raw);
        if (typeof value.answer !== 'string' || !value.answer.trim()) {
          throw new Error('Invalid inquiry response');
        }
        answer = value.answer.trim();
        provider = this.provider.name;
      } catch (error) {
        this.logProviderFallback('inquiry response', error);
        provider = 'fallback';
      }
    }
    return {
      intent: 'general_question',
      confidence: provider === 'fallback' ? 0.65 : 0.9,
      extractedEntities: {},
      missingFields: [],
      assistantReply: answer,
      provider,
    };
  }

  private fallbackResolveRoute(message: string): ResolveAssistantRouting {
    const normalized = message.trim().toLocaleLowerCase();
    let route: ResolveAssistantRoute = 'general';
    let reason = 'Consulta general sobre Resolve.';

    if (
      /\b(mi|mis|nuestro|nuestros)\s+proyecto(?:s)?\b|\b(estado|avance|progreso|tarea(?:s)?|entregable(?:s)?|pago(?:s)?|participante(?:s)?)\b.*\bproyecto(?:s)?\b|\bconsult(?:ar|a|o)\b.*\bproyecto(?:s)?\b/i.test(
        normalized,
      )
    ) {
      route = 'project';
      reason = 'El usuario quiere consultar la ejecución de sus proyectos.';
    } else if (
      /\b(oportunidad(?:es)?|empleo(?:s)?|vacante(?:s)?|trabajo(?:s)?\s+(?:remoto|freelance)|postular|buscar\s+trabajo)\b/i.test(
        normalized,
      )
    ) {
      route = 'opportunity';
      reason = 'El usuario quiere explorar oportunidades disponibles.';
    } else if (
      /\b(ofrecer|registrar|validar|certificar|demostrar)\b.*\b(capacidad(?:es)?|habilidad(?:es)?|experiencia)\b|\bquiero ofrecer\b/i.test(
        normalized,
      )
    ) {
      route = 'capability';
      reason = 'El usuario quiere ofrecer o validar una capacidad.';
    } else if (
      /\b(necesito|quiero|busco|ayuda|resolver|solucionar|error|problema|falla)\b/i.test(
        normalized,
      )
    ) {
      route = 'problem';
      reason = 'El usuario describe una necesidad que debe resolverse.';
    }

    return {
      route,
      confidence: route === 'general' ? 0.6 : 0.78,
      query: message.trim(),
      reason,
      provider: 'fallback',
    };
  }

  private async startCapabilityAssessment(
    text: string,
  ): Promise<CapabilityAssessmentState> {
    const raw = await this.provider.generate(
      [
        'Diseña una evaluación breve para una capacidad profesional.',
        'Devuelve sólo JSON con capability (string), tags (string[]) y questions (exactamente 3 objetos).',
        'Cada objeto debe contener prompt (string) y options (exactamente 4 respuestas breves y plausibles).',
        'Debe existir una opción claramente mejor, sin usar “todas las anteriores”.',
        'Las preguntas deben estar en español, adaptadas a la capacidad y evaluar:',
        '1) conocimiento aplicado, 2) resolución de un caso práctico y 3) criterio profesional/experiencia.',
        'No preguntes por el nivel declarado ni por datos personales.',
        `Texto: ${text}`,
      ].join('\n'),
    );
    const value = parseJsonObject(raw);
    if (
      typeof value.capability !== 'string' ||
      !value.capability.trim() ||
      !Array.isArray(value.tags) ||
      !value.tags.every((tag) => typeof tag === 'string') ||
      !Array.isArray(value.questions) ||
      value.questions.length !== 3 ||
      !value.questions.every(
        (question) =>
          question &&
          typeof question === 'object' &&
          typeof (question as Record<string, unknown>).prompt === 'string' &&
          Boolean(
            ((question as Record<string, unknown>).prompt as string).trim(),
          ) &&
          Array.isArray((question as Record<string, unknown>).options) &&
          ((question as Record<string, unknown>).options as unknown[])
            .length === 4 &&
          ((question as Record<string, unknown>).options as unknown[]).every(
            (option) => typeof option === 'string' && option.trim(),
          ),
      )
    ) {
      throw new Error('AI provider returned an invalid questionnaire schema');
    }
    return {
      capability: value.capability.trim(),
      tags: [...new Set(value.tags.map((tag) => tag.trim()).filter(Boolean))],
      questions: value.questions.map((question) => {
        const item = question as { prompt: string; options: string[] };
        return {
          prompt: item.prompt.trim(),
          options: item.options.map((option) => option.trim()) as [
            string,
            string,
            string,
            string,
          ],
        };
      }) as CapabilityAssessmentState['questions'],
      answers: [],
      stage: 'question',
    };
  }

  private async evaluateCapabilityAssessment(
    assessment: CapabilityAssessmentState,
  ): Promise<CapabilityAssessmentResult> {
    const raw = await this.provider.generate(
      [
        'Evalúa tres respuestas sobre una capacidad profesional.',
        'Devuelve sólo JSON con score (integer 0-100), suggestedLevel (beginner|intermediate|advanced|expert),',
        'strengths (1-6 strings), improvementAreas (0-6 strings) y summary (string breve en español).',
        'Evalúa razonamiento aplicado, precisión, seguridad y criterio. No inventes experiencia no mencionada.',
        `Capacidad: ${assessment.capability}`,
        `Preguntas y respuestas: ${JSON.stringify(
          assessment.questions.map((question, index) => ({
            question: question.prompt,
            options: question.options,
            answer:
              assessment.answers[index]?.selectedOption ??
              AiEngineService.TIMEOUT_MESSAGE,
            timedOut: assessment.answers[index]?.timedOut ?? true,
          })),
        )}`,
      ].join('\n'),
      { complex: true },
    );
    const value = parseJsonObject(raw);
    const levels = Object.values(ProficiencyLevel) as string[];
    if (
      !Number.isInteger(value.score) ||
      Number(value.score) < 0 ||
      Number(value.score) > 100 ||
      !levels.includes(String(value.suggestedLevel)) ||
      !Array.isArray(value.strengths) ||
      !value.strengths.length ||
      !value.strengths.every((item) => typeof item === 'string') ||
      !Array.isArray(value.improvementAreas) ||
      !value.improvementAreas.every((item) => typeof item === 'string') ||
      typeof value.summary !== 'string'
    ) {
      throw new Error('AI provider returned an invalid assessment schema');
    }
    return {
      score: Number(value.score),
      suggestedLevel: value.suggestedLevel as ProficiencyLevel,
      strengths: value.strengths.map((item) => item.trim()).filter(Boolean),
      improvementAreas: value.improvementAreas
        .map((item) => item.trim())
        .filter(Boolean),
      summary: value.summary.trim(),
      validationStatus: 'ai_assessed',
    };
  }

  private fallbackSkillCoverage(
    requiredSkills: string[],
    teamSkills: string[],
    candidates: SkillCoverageCandidateInput[],
  ): AiSkillCoverage {
    const coveredSkills = requiredSkills.filter((required) =>
      teamSkills.some((skill) =>
        this.skillsSemanticallyOverlap(required, skill),
      ),
    );
    const missingSkills = requiredSkills.filter(
      (required) => !coveredSkills.includes(required),
    );
    return {
      coveredSkills,
      missingSkills,
      candidateMatches: candidates.map((candidate) => {
        const matchingSkills = candidate.skills.filter((skill) =>
          missingSkills.some((required) =>
            this.skillsSemanticallyOverlap(required, skill),
          ),
        );
        return {
          id: candidate.id,
          matchingSkills,
          score: missingSkills.length
            ? Math.round((matchingSkills.length / missingSkills.length) * 100)
            : 0,
        };
      }),
    };
  }

  private skillsSemanticallyOverlap(left: string, right: string): boolean {
    const normalize = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLocaleLowerCase();
    const normalizedLeft = normalize(left);
    const normalizedRight = normalize(right);
    if (
      normalizedLeft === normalizedRight ||
      normalizedLeft.includes(normalizedRight) ||
      normalizedRight.includes(normalizedLeft)
    )
      return true;
    const synonymGroups = [
      ['depuracion', 'debugging', 'diagnostico', 'troubleshooting'],
      ['backend', 'desarrollo backend', 'servidor', 'api', 'apis'],
      ['frontend', 'desarrollo web', 'interfaz', 'ui'],
      ['experiencia de usuario', 'ux', 'usabilidad'],
      ['diseno', 'diseno grafico', 'figma', 'ui'],
      ['base de datos', 'sql', 'postgresql', 'mongodb'],
    ];
    return synonymGroups.some(
      (group) =>
        group.some((value) => normalizedLeft.includes(value)) &&
        group.some((value) => normalizedRight.includes(value)),
    );
  }

  private logProviderFallback(operation: string, error: unknown): void {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    this.logger.warn(
      `Using deterministic fallback for ${operation}; ${this.provider.name} failed: ${reason}`,
    );
  }

  private hasUsefulDescription(text: string): boolean {
    const normalized = text
      .replace(/necesito resolver un problema con/gi, '')
      .replace(/quiero resolver/gi, '')
      .trim();
    return normalized.length >= 20;
  }

  private fallbackProblemAnalysis(description: string): AiAnalysis {
    const urgent = /urgente|emergencia|peligro|incendio|inundaci[oó]n/i.test(
      description,
    );
    return {
      category: 'General',
      urgencyLevel: urgent ? 'High' : 'Medium',
      requiredSkills: ['Diagnóstico técnico'],
      summary:
        'Entendí el problema y organicé la información disponible para buscar una solución adecuada.',
    };
  }

  private hasUsefulCapability(text: string): boolean {
    return (
      text
        .replace(/quiero ofrecer (?:mi )?experiencia en/gi, '')
        .replace(/quiero registrar (?:mi )?capacidad en/gi, '')
        .trim().length >= 3
    );
  }

  private fallbackAssessmentStart(text: string): CapabilityAssessmentState {
    const skillMatch = text.match(
      /(?:experiencia|capacidad|habilidad|especialista|trabajo|ofrecer)(?:\s+(?:en|de))?\s+([^.,\n]+)/i,
    );
    const rawSkill =
      skillMatch?.[1]?.replace(/https?:\/\/\S+/gi, '').trim() ??
      text.trim().slice(0, 80);
    const capability = rawSkill || 'la capacidad indicada';
    return {
      capability,
      tags: [capability.slice(0, 80)],
      questions: [
        {
          prompt: `¿Cuál es el mejor enfoque inicial para aplicar ${capability} en una tarea real?`,
          options: [
            'Definir el objetivo, restricciones y pasos verificables',
            'Empezar sin aclarar el resultado esperado',
            'Copiar una solución sin revisar el contexto',
            'Posponer toda validación hasta el final',
          ],
        },
        {
          prompt: `Ante un problema inesperado relacionado con ${capability}, ¿qué harías primero?`,
          options: [
            'Reproducir el problema y reunir evidencia antes de decidir',
            'Cambiar varias cosas a la vez sin medir',
            'Ignorar el impacto y continuar',
            'Elegir la primera solución encontrada',
          ],
        },
        {
          prompt: `¿Cómo demostrarías criterio profesional al usar ${capability}?`,
          options: [
            'Documentar la decisión, sus riesgos y cómo se comprobó',
            'Basarme sólo en intuición',
            'Evitar explicar los resultados',
            'Declarar éxito sin evidencia',
          ],
        },
      ],
      answers: [],
      stage: 'question',
    };
  }

  private fallbackAssessmentResult(
    assessment: CapabilityAssessmentState,
  ): CapabilityAssessmentResult {
    const averageWords =
      assessment.answers.reduce(
        (total, answer) =>
          total +
          (answer.timedOut
            ? 0
            : answer.selectedOption.split(/\s+/).filter(Boolean).length),
        0,
      ) / 3;
    const score = Math.max(35, Math.min(82, Math.round(40 + averageWords * 2)));
    const suggestedLevel =
      score >= 78
        ? ProficiencyLevel.ADVANCED
        : score >= 60
          ? ProficiencyLevel.INTERMEDIATE
          : ProficiencyLevel.BEGINNER;
    return {
      score,
      suggestedLevel,
      strengths: ['Explicación de experiencia aplicada'],
      improvementAreas:
        score < 60
          ? ['Agregar más detalle técnico y criterios verificables']
          : ['Respaldar la evaluación con evidencia verificable'],
      summary: `La evaluación inicial sugiere un nivel ${suggestedLevel} en ${assessment.capability}.`,
      validationStatus: 'ai_assessed',
    };
  }

  private parseProposalDraft(
    value: Record<string, unknown>,
    fallback: AiProposalDraft,
  ): AiProposalDraft {
    const strings = (candidate: unknown): string[] =>
      Array.isArray(candidate)
        ? candidate
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
    const activities = Array.isArray(value.activities)
      ? value.activities.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const activity = item as Record<string, unknown>;
          return typeof activity.title === 'string' &&
            typeof activity.description === 'string'
            ? [
                {
                  title: activity.title.trim(),
                  description: activity.description.trim(),
                },
              ]
            : [];
        })
      : [];
    const deliverables = Array.isArray(value.deliverables)
      ? value.deliverables.flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const deliverable = item as Record<string, unknown>;
          const offset = Number(deliverable.dueOffsetDays);
          return typeof deliverable.title === 'string' &&
            typeof deliverable.description === 'string' &&
            Number.isFinite(offset)
            ? [
                {
                  title: deliverable.title.trim(),
                  description: deliverable.description.trim(),
                  dueOffsetDays: Math.max(1, Math.round(offset)),
                },
              ]
            : [];
        })
      : [];
    const duration = Math.max(
      1,
      Math.round(Number(value.estimatedDurationDays) || 0),
    );
    const rawPrice =
      value.suggestedPrice &&
      typeof value.suggestedPrice === 'object' &&
      !Array.isArray(value.suggestedPrice)
        ? (value.suggestedPrice as Record<string, unknown>)
        : {};
    const amount = Math.max(0, Number(rawPrice.amount) || 0);
    const proposedCurrency = String(rawPrice.currency ?? '').toUpperCase();
    if (
      typeof value.summary !== 'string' ||
      typeof value.scope !== 'string' ||
      !activities.length ||
      !deliverables.length ||
      !strings(value.acceptanceCriteria).length ||
      !duration
    ) {
      throw new Error('AI provider returned an invalid proposal draft');
    }
    return {
      summary: value.summary.trim(),
      scope: value.scope.trim(),
      activities: activities.slice(0, 6),
      deliverables: deliverables
        .slice(0, 5)
        .sort((left, right) => left.dueOffsetDays - right.dueOffsetDays)
        .map((item) => ({
          ...item,
          dueOffsetDays: Math.min(item.dueOffsetDays, duration),
        })),
      acceptanceCriteria: strings(value.acceptanceCriteria),
      estimatedDurationDays: duration,
      conditions: strings(value.conditions).length
        ? strings(value.conditions)
        : fallback.conditions,
      assumptions: strings(value.assumptions).length
        ? strings(value.assumptions)
        : fallback.assumptions,
      suggestedPrice: {
        amount,
        currency: ['PEN', 'USD', 'EUR'].includes(proposedCurrency)
          ? proposedCurrency
          : fallback.suggestedPrice.currency,
      },
    };
  }

  private fallbackProposalDraft(input: ProposalDraftInput): AiProposalDraft {
    const skillLabel =
      input.requiredSkills.join(', ') || 'las capacidades requeridas';
    return {
      summary: `Propuesta para resolver: ${input.problem.slice(0, 180)}`,
      scope: `Se analizará, implementará y validará una solución enfocada en ${skillLabel}, con avances verificables y coordinación con el solicitante.`,
      activities: [
        {
          title: 'Diagnóstico y planificación',
          description:
            'Confirmar el alcance, restricciones, criterios de éxito y plan de trabajo.',
        },
        {
          title: 'Implementación',
          description:
            'Ejecutar la solución acordada y documentar las decisiones relevantes.',
        },
        {
          title: 'Validación y entrega',
          description:
            'Verificar los criterios de aceptación y entregar la evidencia final.',
        },
      ],
      deliverables: [
        {
          title: 'Plan de solución',
          description: 'Alcance y plan de trabajo validados.',
          dueOffsetDays: 2,
        },
        {
          title: 'Solución implementada',
          description: 'Resultado funcional con documentación y evidencia.',
          dueOffsetDays: 7,
        },
      ],
      acceptanceCriteria: [
        'El alcance acordado está cubierto',
        'Los entregables incluyen evidencia verificable',
        'El solicitante puede validar el resultado',
      ],
      estimatedDurationDays: 7,
      conditions: ['Los cambios de alcance se acuerdan antes de ejecutarse'],
      assumptions: [
        'El solicitante facilitará accesos e información necesarios',
      ],
      suggestedPrice: { amount: 0, currency: 'PEN' },
    };
  }

  private extractUrls(text: string): string[] {
    return [...new Set(text.match(/https?:\/\/[^\s,]+/gi) ?? [])];
  }

  private fallbackEnglishOpportunityQuery(query: string): string {
    const dictionary: Array<[RegExp, string]> = [
      [/\bdesarrollador(?:a)?\b/gi, 'developer'],
      [/\bprogramador(?:a)?\b/gi, 'developer'],
      [/\bdiseñador(?:a)?\b/gi, 'designer'],
      [/\bdatos\b/gi, 'data'],
      [/\bremoto\b/gi, 'remote'],
      [/\bbackend\b/gi, 'backend'],
      [/\bfrontend\b/gi, 'frontend'],
      [/\bempleo\b|\btrabajo\b|\bproyecto\b/gi, 'job'],
      [/\boportunidades?\b/gi, ''],
      [/\brelacionad[oa]s?\b|\bmu[eé]strame\b|\bquiero\b/gi, ''],
      [/\bcon\b|\bde\b|\bpara\b/gi, ' '],
    ];
    return dictionary
      .reduce((translated, [pattern, replacement]) => {
        return translated.replace(pattern, replacement);
      }, query)
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeAssessment(
    assessment: CapabilityAssessmentState,
  ): CapabilityAssessmentState {
    const fallback = this.fallbackAssessmentStart(assessment.capability);
    const rawQuestions = assessment.questions as unknown as Array<
      string | { prompt?: string; options?: string[] }
    >;
    const questions = rawQuestions.map((question, index) => {
      if (typeof question === 'string') {
        return {
          prompt: question,
          options: fallback.questions[index].options,
        };
      }
      const options = question.options?.filter(Boolean) ?? [];
      return {
        prompt: question.prompt?.trim() || fallback.questions[index].prompt,
        options:
          options.length === 4
            ? (options as [string, string, string, string])
            : fallback.questions[index].options,
      };
    }) as CapabilityAssessmentState['questions'];
    const rawAnswers = assessment.answers as unknown as Array<
      | string
      | {
          questionIndex: number;
          selectedOption: string;
          answeredAt: string;
          timedOut: boolean;
        }
    >;
    return {
      ...assessment,
      questions,
      answers: rawAnswers.map((answer, index) =>
        typeof answer === 'string'
          ? {
              questionIndex: index,
              selectedOption: answer,
              answeredAt: new Date(0).toISOString(),
              timedOut: false,
            }
          : answer,
      ),
      stage:
        assessment.stage ??
        (assessment.result ? 'evidence_choice' : 'question'),
    };
  }

  private isPortfolioAcceptance(text: string): boolean {
    return (
      text === AiEngineService.CREATE_PORTFOLIO_REPLY ||
      /^(s[ií]|crear|genera|generar).*(portafolio)?/i.test(text)
    );
  }

  private isExternalEvidenceChoice(text: string): boolean {
    if (/\b(?:no tengo|sin)\b.*(?:enlace|portafolio|evidencia)/i.test(text)) {
      return false;
    }
    return (
      text === AiEngineService.USE_EXTERNAL_LINK_REPLY ||
      /(?:usar[eé]?|tengo|compartir[eé]?).*(?:enlace|portafolio|evidencia)/i.test(
        text,
      )
    );
  }
}
