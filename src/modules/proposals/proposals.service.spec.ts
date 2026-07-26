import { ProposalStatus } from '../../shared';
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
        href: '/problems?proposal=proposal-1',
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
        href: '/opportunities?proposal=proposal-1',
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
