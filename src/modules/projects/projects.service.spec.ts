import { JobStatus, SkillCardStatus, UserRole } from '../../shared';
import { Project } from './entities/project.entity';
import { ProjectsService } from './projects.service';

describe('ProjectsService collaboration', () => {
  const project: Project = {
    id: 'project-1',
    proposalId: 'proposal-1',
    problemId: 'problem-1',
    requesterId: 'requester-1',
    solverIds: ['solver-1'],
    leadSolverId: 'solver-1',
    participantIds: ['requester-1', 'solver-1'],
    title: 'Corregir una aplicación Node.js',
    acceptanceCriteria: ['El error no se reproduce'],
    deliverySchedule: [],
    totalPrice: 200,
    currency: 'USD',
    memberShares: { 'solver-1': 100 },
    status: JobStatus.ACTIVE,
    completionEvidenceIds: [],
    createdAt: '2026-07-26T12:00:00.000Z',
    updatedAt: '2026-07-26T12:00:00.000Z',
  };

  function setup() {
    const projects = {
      findOneBy: jest.fn().mockResolvedValue({ ...project }),
      create: jest.fn((value: Project) => value),
      save: jest.fn(async (value: Project) => value),
    };
    const realtime = { emitToUsers: jest.fn() };
    const notifications = {
      createSafely: jest.fn().mockResolvedValue(undefined),
      createForUsersSafely: jest.fn().mockResolvedValue(undefined),
    };
    const room = {
      ensureRoom: jest.fn().mockResolvedValue(undefined),
    };
    const users = {
      searchPublic: jest.fn().mockResolvedValue([
        {
          id: 'solver-2',
          displayName: 'Ana UX',
          email: 'ana@example.com',
          roles: [UserRole.SOLVER],
        },
      ]),
      getPublicById: jest.fn().mockResolvedValue({
        id: 'solver-2',
        displayName: 'Ana UX',
        email: 'ana@example.com',
        roles: [UserRole.SOLVER],
      }),
      findPublicByIds: jest.fn().mockImplementation((ids: string[]) =>
        Promise.resolve(
          ids.map((id) => ({
            id,
            displayName: id,
            email: `${id}@example.com`,
            roles: [
              id === 'requester-1' ? UserRole.REQUESTER : UserRole.SOLVER,
            ],
          })),
        ),
      ),
    };
    const skillCards = {
      findPublished: jest.fn().mockResolvedValue([
        {
          id: 'card-1',
          ownerId: 'solver-1',
          tags: ['Node.js'],
          status: SkillCardStatus.PUBLISHED,
        },
        {
          id: 'card-2',
          ownerId: 'solver-2',
          tags: ['UX'],
          status: SkillCardStatus.PUBLISHED,
        },
      ]),
    };
    const aiEngine = {
      providerName: 'nvidia',
      analyzeProblem: jest.fn().mockResolvedValue({
        category: 'software',
        urgencyLevel: 'Medium',
        requiredSkills: ['Node.js', 'UX'],
        summary: 'Corregir la aplicación',
      }),
      analyzeSkillCoverage: jest.fn().mockResolvedValue({
        coveredSkills: ['Node.js'],
        missingSkills: ['UX'],
        candidateMatches: [
          { id: 'solver-2', matchingSkills: ['UX'], score: 100 },
        ],
      }),
    };
    const problems = {
      findOneBy: jest
        .fn()
        .mockResolvedValue({ id: 'problem-1', description: project.title }),
    };
    const invitations = {
      findOneBy: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    };
    const service = new ProjectsService(
      projects as never,
      {} as never,
      {} as never,
      problems as never,
      {} as never,
      invitations as never,
      realtime as never,
      notifications as never,
      users as never,
      skillCards as never,
      aiEngine as never,
      room as never,
    );
    return {
      service,
      projects,
      invitations,
      notifications,
      realtime,
      room,
    };
  }

  it('uses AI-required skills to recommend a matching collaborator', async () => {
    const { service } = setup();

    const result = await service.findCollaborators('solver-1', project.id, '');

    expect(result.provider).toBe('nvidia');
    expect(result.recommendation).toBe('add_collaborators');
    expect(result.missingSkills).toEqual(['UX']);
    expect(result.candidates[0]).toEqual(
      expect.objectContaining({
        id: 'solver-2',
        matchingSkills: ['UX'],
      }),
    );
  });

  it('returns the winning project when concurrent creation hits uniqueness', async () => {
    const { service, projects, notifications, room } = setup();
    projects.findOneBy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(project);
    projects.save.mockRejectedValueOnce({ code: '23505' });

    const result = await service.createFromAcceptedProposal({
      proposalId: project.proposalId,
      problemId: project.problemId,
      requesterId: project.requesterId,
      leadSolverId: project.leadSolverId!,
      solverIds: project.solverIds,
      title: project.title,
      acceptanceCriteria: project.acceptanceCriteria,
      deliverySchedule: project.deliverySchedule,
      price: project.totalPrice!,
      currency: project.currency!,
    });

    expect(result).toBe(project);
    expect(room.ensureRoom).toHaveBeenCalledWith(project);
    expect(notifications.createForUsersSafely).not.toHaveBeenCalled();
  });

  it('creates a pending invitation without granting project access', async () => {
    const { service, projects, invitations, notifications, realtime } = setup();

    const invitation = await service.inviteCollaborator(
      'solver-1',
      project.id,
      'solver-2',
      ['UX'],
      25,
    );

    expect(projects.save).not.toHaveBeenCalled();
    expect(invitations.save).toHaveBeenCalledWith(
      expect.objectContaining({
        invitedUserId: 'solver-2',
        status: 'pending',
        allocationPercent: 25,
      }),
    );
    expect(invitation.status).toBe('pending');
    expect(notifications.createSafely).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'solver-2',
        href: '/projects',
      }),
    );
    expect(realtime.emitToUsers).toHaveBeenCalledWith(
      ['solver-2'],
      'project.invitation.created',
      expect.objectContaining({ projectId: 'project-1', status: 'pending' }),
    );
  });
});
