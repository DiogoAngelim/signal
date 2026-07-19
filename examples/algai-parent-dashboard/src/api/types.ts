export type AttentionLevel = "steady" | "watch" | "needs-support";

export type LearningArea =
  | "reading"
  | "math"
  | "writing"
  | "focus"
  | "participation"
  | "attendance"
  | "well-being"
  | "social-development"
  | "homework-consistency";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  provider: "google";
}

export interface TeacherIdentity {
  id: string;
  name: string;
  email: string;
}

export interface StudentIdentity {
  id: string;
  childName: string;
  childEmail: string;
  grade: string;
  className: string;
  teacher: TeacherIdentity;
  lastUpdate: string;
}

export interface SubjectLearningRecord {
  subject: string;
  currentFocus: string;
  confidence: "growing" | "steady" | "needs-practice";
  progressNote: string;
  evidence: string[];
}

export interface LearningRecommendation {
  id: string;
  area: LearningArea;
  title: string;
  explanation: string;
  parentAction: string;
  attentionLevel: AttentionLevel;
  evidenceCount: number;
}

export interface TeacherNote {
  id: string;
  date: string;
  author: string;
  note: string;
}

export interface RecentChange {
  id: string;
  date: string;
  label: string;
  detail: string;
  attentionLevel: AttentionLevel;
}

export interface EvidenceItem {
  id: string;
  date: string;
  area: LearningArea;
  summary: string;
  confidence: "early" | "repeated" | "confirmed";
}

export interface LearningDecisionQuality {
  supportingEvidence: string[];
  assumptions: string[];
  contradictoryIndicators: string[];
  unknowns: string[];
  lessons: string[];
  nextActions: string[];
  nextBestEvidence: {
    title: string;
    whyItMatters: string;
    expectedImpact: string;
  };
}

export interface StudentLearningSummary {
  student: StudentIdentity;
  accessStatus: "validated-parent";
  subjects: SubjectLearningRecord[];
  strengths: LearningRecommendation[];
  practiceNeeds: LearningRecommendation[];
  monitorAreas: LearningRecommendation[];
  discussionPrompts: {
    child: string[];
    teacher: string[];
  };
  supportPlan: LearningRecommendation[];
  teacherNotes: TeacherNote[];
  recentChanges: RecentChange[];
  learningReview: {
    changed: string[];
    improved: string[];
    stable: string[];
    stillNeedsProof: string[];
  };
  recommendedNextStep: {
    title: string;
    detail: string;
    whyNow: string;
  };
  decisionQuality?: LearningDecisionQuality;
  evidenceHistory: EvidenceItem[];
  dashboardPermissions: {
    studentId: string;
    canViewParentDashboard: boolean;
    validatedParentEmail: string;
    validatedAt: string;
  };
}

export interface StudentAccessRecord {
  studentId: string;
  parentEmails: string[];
  childEmail: string;
  teacherEmail: string;
  updatedAt: string;
}

export type AlgaiAccessResolution =
  | {
      kind: "unauthenticated";
      message: string;
      loginUrl: string;
    }
  | {
      kind: "parent";
      email: string;
      user?: AuthenticatedUser;
      dashboards: StudentLearningSummary[];
      generatedAt: string;
    }
  | {
      kind: "child";
      email: string;
      studentId: string;
      childAccessPath: string;
      message: string;
    }
  | {
      kind: "denied";
      email: string;
      message: string;
      nextSteps: string[];
    };

export interface ParentDashboardAccessPayload {
  user: AuthenticatedUser;
  parentEmail: string;
  students: StudentLearningSummary[];
  generatedAt: string;
}

export interface ParentAccessUpdateInput {
  teacherEmail: string;
  studentId: string;
  parentEmails: string[];
}

export interface ParentAccessUpdateResult {
  studentId: string;
  parentEmails: string[];
  updatedAt: string;
}

export interface AlgaiStudentDataSource {
  getAuthenticatedUser(): Promise<AuthenticatedUser | null>;
  getParentDashboardAccess(): Promise<ParentDashboardAccessPayload | null>;
  getStudentAccessForEmail(email: string): Promise<StudentAccessRecord | null>;
  getStudentAccessRecordsForEmail(
    email: string,
  ): Promise<StudentAccessRecord[]>;
  getStudentAccessRecord(
    studentId: string,
  ): Promise<StudentAccessRecord | null>;
  getLearningSummary(studentId: string): Promise<StudentLearningSummary | null>;
  isTeacherAuthorizedForStudent(
    teacherEmail: string,
    studentId: string,
  ): Promise<boolean>;
  updateParentEmailsForStudent(
    input: ParentAccessUpdateInput,
  ): Promise<ParentAccessUpdateResult>;
}

export interface DemoAlgaiStudentDataSource extends AlgaiStudentDataSource {
  setAuthenticatedUser(user: AuthenticatedUser | null): Promise<void>;
}
