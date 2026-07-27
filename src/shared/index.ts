export enum UserRole {
  REQUESTER = 'requester',
  SOLVER = 'solver',
  ADMIN = 'admin',
}

export enum ProficiencyLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert',
}

export enum ProblemStatus {
  DRAFT = 'draft',
  IN_CONVERSATION = 'in_conversation',
  PENDING_CONFIRMATION = 'pending_confirmation',
  PUBLISHED = 'published',
  ANALYZING = 'analyzing',
  MATCHING = 'matching',
  TEAM_SUGGESTED = 'team_suggested',
  PROPOSAL_SENT = 'proposal_sent',
  IN_EXECUTION = 'in_execution',
  IN_VALIDATION = 'in_validation',
  RESOLVED = 'resolved',
  UNRESOLVED = 'unresolved',
  CANCELLED = 'cancelled',
  REPORTED = 'reported',
}

export enum SkillCardStatus {
  DRAFT = 'draft',
  PENDING_CONFIRMATION = 'pending_confirmation',
  PUBLISHED = 'published',
  PENDING_VALIDATION = 'pending_validation',
  VALIDATED = 'validated',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
}

export enum UrgencyLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum Availability {
  AVAILABLE = 'available',
  BUSY = 'busy',
  UNAVAILABLE = 'unavailable',
}

export enum MatchStatus {
  SUGGESTED = 'suggested',
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
  PROPOSAL_SUBMITTED = 'proposal_submitted',
  EXPIRED = 'expired',
}

export enum TeamRole {
  LEAD = 'lead',
  MEMBER = 'member',
}

export enum ProposalStatus {
  SUBMITTED = 'submitted',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  ADJUSTMENT_REQUESTED = 'adjustment_requested',
  REVISED = 'revised',
}

export enum DisputeStatus {
  OPEN = 'open',
  UNDER_REVIEW = 'under_review',
  RESOLVED = 'resolved',
}

export enum JobStatus {
  ACTIVE = 'active',
  PENDING_VALIDATION = 'pending_validation',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}

export enum TeamStatus {
  SUGGESTED = 'suggested',
  CONFIRMED = 'confirmed',
  DISMISSED = 'dismissed',
}

export enum ProjectTaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

export enum ProjectMessageType {
  MESSAGE = 'message',
  PROGRESS = 'progress',
  COMPLETION = 'completion',
  VALIDATION = 'validation',
  ADDITIONAL_WORK = 'additional_work',
  FILE = 'file',
  IMAGE = 'image',
  LINK = 'link',
  SYSTEM = 'system',
  MEETING = 'meeting',
}

export enum ProjectChannelType {
  GENERAL = 'general',
  TEAM_INTERNAL = 'team_internal',
  CUSTOM = 'custom',
}

export enum ProjectFileVisibility {
  PROJECT = 'project',
  CLIENT_AND_TEAM = 'client_and_team',
  TEAM_ONLY = 'team_only',
  CONVERSATION = 'conversation',
}

export enum ProjectFileCategory {
  REQUIREMENT = 'requirement',
  EVIDENCE = 'evidence',
  DESIGN = 'design',
  SOURCE_CODE = 'source_code',
  DELIVERABLE = 'deliverable',
  REPORT = 'report',
  IMAGE = 'image',
  OTHER = 'other',
}

export enum ProjectLinkType {
  GENERAL = 'general',
  GITHUB = 'github',
  GITLAB = 'gitlab',
  DOCUMENTATION = 'documentation',
  DESIGN = 'design',
  MEETING = 'meeting',
  OTHER = 'other',
}

export enum ProjectMeetingType {
  KICKOFF = 'kickoff',
  FOLLOW_UP = 'follow_up',
  TECHNICAL = 'technical',
  CLIENT_REVIEW = 'client_review',
  DELIVERY = 'delivery',
  OTHER = 'other',
}

export enum ProjectMeetingStatus {
  SCHEDULED = 'scheduled',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  RESCHEDULED = 'rescheduled',
}

export enum EvidenceType {
  PROGRESS = 'progress',
  COMPLETION = 'completion',
}

export enum EvidenceStatus {
  SUBMITTED = 'submitted',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

export enum MediaType {
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  DOCUMENT = 'document',
  CODE_LINK = 'code_link',
}

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface TaxonomySkill {
  skillId: string;
  name: string;
  weight: number;
}

export interface MediaRef {
  id: string;
  type: MediaType;
  url: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PendingAction {
  id: string;
  actionType:
    'message_send' | 'evidence_upload' | 'progress_update' | 'proposal_submit';
  payload: Record<string, unknown>;
  createdAt: string;
  syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
}
