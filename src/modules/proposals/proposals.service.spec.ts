import {
  MatchStatus,
  ProblemStatus,
  ProposalStatus,
  TeamRole,
  TeamStatus,
} from '../../shared';
import { Proposal } from './entities/proposal.entity';
import { ProposalsService } from './proposals.service';

describe('ProposalsService adjustment flow', () => {
  const proposal: Proposal = {
    id: 'proposal-1',
    problemId: 'problem-1',
    requesterId: 'requester-1',
    submittedBy: 'solver-1',
    solverIds: ['solver-1'],
    summary: 'Propuesta original',
    scope: 'Alcance original',
    activities: [{ title: 'Diagnóstico', description: 'Encontrar la causa' }],
    teamMembers: [],
    deliverables: ['Código corregido'],
    deliverySchedule: [
      {
        id: 'delivery-1',
        title: 'Código corregido',
        description: 'Versión validada',
        dueDate: '2026-08-05',
      },
    ],
    estimatedDuration: 'P5D',
    price: 500,
    currency: 'PEN',
    conditions: ['Acceso al repositorio'],
    acceptanceCriteria: ['El error no se reproduce'],
    status: ProposalStatus.ADJUSTMENT_REQUESTED,
    revision: 1,
    responseNote: 'Reducir la duración',
    createdAt: '2026-07-26T12:00:00.000Z',
    updatedAt: '2026-07-26T13:00:00.000Z',
  };

  function setup() {
    const proposals = {
      findOneBy: jest.fn().mockResolvedValue({ ...proposal }),
      merge: jest.fn((target: Proposal, source: Partial<Proposal>) =>
        Object.assign(target, source),
      ),
      save: jest.fn(async (value: Proposal) => value),
    };
    const notifications = {
      createSafely: jest.fn().mockResolvedValue(undefined),
      createForUsersSafely: jest.fn().mockResolvedValue(undefined),
    };
    const realtime = {
      emitToUser: jest.fn(),
      emitToUsers: jest.fn(),
    };
    const service = new ProposalsService(
      proposals as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      notifications as never,
      realtime as never,
    );
    return { service, notifications, realtime };
  }

  it('notifies the requester and emits realtime after a revision', async () => {
    const { service, notifications, realtime } = setup();

    const revised = await service.revise('solver-1', proposal.id, {
      summary: 'Propuesta reajustada',
      scope: 'Nuevo alcance',
      activities: [{ title: 'Diagnóstico', description: 'Revisar la causa' }],
      teamMembers: [],
      deliverables: ['Código actualizado'],
      deliverySchedule: [
        {
          title: 'Código actualizado',
          description: 'Versión reajustada',
          dueDate: '2026-08-04',
        },
      ],
      estimatedDuration: 'P4D',
      price: 450,
      currency: 'PEN',
      conditions: ['Acceso al repositorio'],
      acceptanceCriteria: ['El error no se reproduce'],
    });

    expect(revised.status).toBe(ProposalStatus.REVISED);
    expect(revised.revision).toBe(2);
    expect(revised.responseNote).toBeNull();
    expect(notifications.createSafely).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'requester-1',
        title: 'Propuesta reajustada',
        href: '/problems/problem-1?proposal=proposal-1',
      }),
    );
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      'requester-1',
      'proposal.updated',
      revised,
    );
  });

  it('notifies the solver and emits realtime for an adjustment request', async () => {
    const { service, notifications, realtime } = setup();
    const submitted = { ...proposal, status: ProposalStatus.SUBMITTED };
    jest.spyOn(service, 'findOne').mockResolvedValue(submitted as Proposal);

    const updated = await service.respond('requester-1', proposal.id, {
      status: ProposalStatus.ADJUSTMENT_REQUESTED,
      note: 'Reducir la duración',
    });

    expect(notifications.createForUsersSafely).toHaveBeenCalledWith(
      ['solver-1'],
      expect.objectContaining({
        href: '/opportunities?proposal=proposal-1&problem=problem-1',
      }),
      'requester-1',
    );
    expect(realtime.emitToUsers).toHaveBeenCalledWith(
      ['solver-1'],
      'proposal.updated',
      updated,
    );
  });
});

describe('ProposalsService team proposal rules', () => {
  it('allows a suggested individual match to submit without prior selection', async () => {
    const matches = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 'match-1',
        problemId: 'problem-1',
        solverId: 'solver-1',
        status: MatchStatus.SUGGESTED,
      }),
    };
    const service = new ProposalsService(
      {} as never,
      {} as never,
      matches as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const solverIds = await (
      service as unknown as {
        authorizedSolvers(
          solverId: string,
          dto: {
            problemId: string;
            teamMembers: Array<{ solverId: string }>;
          },
        ): Promise<string[]>;
      }
    ).authorizedSolvers('solver-1', {
      problemId: 'problem-1',
      teamMembers: [],
    });

    expect(solverIds).toEqual(['solver-1']);
  });

  it('does not attach a confirmed team to an individual opportunity draft', async () => {
    const matches = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 'match-1',
        problemId: 'problem-1',
        solverId: 'solver-1',
        invitationKind: 'individual',
        requiredSkills: [{ skillId: 'react', name: 'React' }],
        explanation: ['Compatible'],
      }),
    };
    const problems = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 'problem-1',
        description: 'Aplicación web en React',
      }),
    };
    const teams = { findOneBy: jest.fn() };
    const aiEngine = {
      providerName: 'test',
      generateProposalDraft: jest.fn().mockResolvedValue({
        summary: 'Propuesta',
      }),
    };
    const service = new ProposalsService(
      {} as never,
      problems as never,
      matches as never,
      teams as never,
      aiEngine as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const draft = await service.generateDraft(
      'solver-1',
      'match-1',
      'Lo haré en React',
    );

    expect(teams.findOneBy).not.toHaveBeenCalled();
    expect(draft.teamMembers).toEqual([]);
    expect(draft).not.toHaveProperty('teamId');
  });

  it('lets the first accepted member over 50% assume team leadership', async () => {
    const proposals = { findOneBy: jest.fn().mockResolvedValue(null) };
    const teams = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 'team-1',
        problemId: 'problem-1',
        status: TeamStatus.CONFIRMED,
        members: [
          {
            solverId: 'solver-1',
            matchId: 'match-1',
            role: TeamRole.LEAD,
            responsibilitySkillIds: ['react'],
          },
          {
            solverId: 'solver-2',
            matchId: 'match-2',
            role: TeamRole.MEMBER,
            responsibilitySkillIds: ['node'],
          },
        ],
      }),
      save: jest.fn(async (team) => team),
    };
    const matches = {
      findBy: jest.fn().mockResolvedValue([
        {
          id: 'match-1',
          solverId: 'solver-1',
          status: MatchStatus.ACCEPTED,
          score: 55,
        },
        {
          id: 'match-2',
          solverId: 'solver-2',
          status: MatchStatus.ACCEPTED,
          score: 62,
        },
      ]),
    };
    const notifications = { createSafely: jest.fn() };
    const realtime = { emitToUser: jest.fn() };
    const service = new ProposalsService(
      proposals as never,
      {} as never,
      matches as never,
      teams as never,
      {} as never,
      {} as never,
      notifications as never,
      realtime as never,
    );

    const solverIds = await (
      service as unknown as {
        authorizedSolvers(
          solverId: string,
          dto: {
            problemId: string;
            teamId: string;
            teamMembers: Array<{ solverId: string }>;
          },
        ): Promise<string[]>;
      }
    ).authorizedSolvers('solver-2', {
      problemId: 'problem-1',
      teamId: 'team-1',
      teamMembers: [{ solverId: 'solver-1' }, { solverId: 'solver-2' }],
    });

    expect(solverIds).toEqual(['solver-1', 'solver-2']);
    expect(teams.save).toHaveBeenCalledWith(
      expect.objectContaining({
        members: expect.arrayContaining([
          expect.objectContaining({
            solverId: 'solver-2',
            role: TeamRole.LEAD,
          }),
        ]),
      }),
    );
    expect(notifications.createSafely).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'solver-1',
        title: 'Cambió el liderazgo de tu equipo',
      }),
    );
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      'solver-1',
      'team.leadership.changed',
      expect.objectContaining({ leadSolverId: 'solver-2' }),
    );
  });
});

describe('ProposalsService financial activation', () => {
  it('creates the payment plan and keeps the problem gated when finance is enabled', async () => {
    const proposal = {
      id: 'proposal-finance',
      problemId: 'problem-finance',
      requesterId: 'requester-1',
      submittedBy: 'solver-1',
      solverIds: ['solver-1'],
      summary: 'Implementación financiera',
      acceptanceCriteria: ['Entrega validada'],
      deliverySchedule: [],
      price: 1000,
      currency: 'PEN',
      status: ProposalStatus.SUBMITTED,
    } as unknown as Proposal;
    const proposals = {
      merge: jest.fn((target, source) => Object.assign(target, source)),
      save: jest.fn(async (value) => value),
    };
    const problem = {
      id: 'problem-finance',
      status: ProblemStatus.PROPOSAL_SENT,
    };
    const problems = {
      findOneBy: jest.fn().mockResolvedValue(problem),
      merge: jest.fn((target, source) => Object.assign(target, source)),
      save: jest.fn(async (value) => value),
    };
    const projects = {
      createFromAcceptedProposal: jest
        .fn()
        .mockResolvedValue({ id: 'project-finance' }),
    };
    const paymentPlans = {
      ensureForAcceptedProject: jest.fn().mockResolvedValue({ id: 'plan-1' }),
    };
    const config = { get: jest.fn().mockReturnValue(true) };
    const service = new ProposalsService(
      proposals as never,
      problems as never,
      {} as never,
      {} as never,
      {} as never,
      projects as never,
      {} as never,
      {} as never,
      paymentPlans as never,
      config as never,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue(proposal);

    const result = await service.respond('requester-1', proposal.id, {
      status: ProposalStatus.ACCEPTED,
    });

    expect(projects.createFromAcceptedProposal).toHaveBeenCalledWith(
      expect.objectContaining({ financialSetupRequired: true }),
    );
    expect(paymentPlans.ensureForAcceptedProject).toHaveBeenCalledWith(
      'requester-1',
      'project-finance',
    );
    expect(problem.status).toBe(ProblemStatus.PROPOSAL_SENT);
    expect(result.status).toBe(ProposalStatus.ACCEPTED);
  });
});
