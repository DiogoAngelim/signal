import type { StudentAccessRecord, StudentLearningSummary } from "./types";

export const demoStudentAccessRecords: StudentAccessRecord[] = [
  {
    studentId: "student-mia-rivera",
    parentEmails: ["parent.rivera@example.com", "caregiver.rivera@example.com"],
    childEmail: "mia.rivera@student.algai.test",
    teacherEmail: "ana.martins@algai.school",
    updatedAt: "2026-06-02T14:00:00.000Z"
  },
  {
    studentId: "student-noah-patel",
    parentEmails: ["parent.patel@example.com", "parent.rivera@example.com"],
    childEmail: "noah.patel@student.algai.test",
    teacherEmail: "ana.martins@algai.school",
    updatedAt: "2026-06-02T14:00:00.000Z"
  }
];

export const demoLearningSummaries: StudentLearningSummary[] = [
  {
    student: {
      id: "student-mia-rivera",
      childName: "Mia Rivera",
      childEmail: "mia.rivera@student.algai.test",
      grade: "Grade 5",
      className: "Fifth Grade Explorers",
      teacher: {
        id: "teacher-ana-martins",
        name: "Ana Martins",
        email: "ana.martins@algai.school"
      },
      lastUpdate: "2026-06-02T14:00:00.000Z"
    },
    accessStatus: "validated-parent",
    subjects: [
      {
        subject: "Reading",
        currentFocus: "Explaining the main idea in her own words",
        confidence: "growing",
        progressNote: "Mia is using more complete sentences when she retells a passage.",
        evidence: ["Two reading reflections completed", "One teacher conference note"]
      },
      {
        subject: "Math",
        currentFocus: "Showing the steps behind multi-step problems",
        confidence: "needs-practice",
        progressNote: "The answer is often close, but the written steps need more care.",
        evidence: ["Three practice samples", "One missed homework pattern"]
      },
      {
        subject: "Writing",
        currentFocus: "Planning before drafting",
        confidence: "steady",
        progressNote: "Short outlines are helping her stay organized.",
        evidence: ["Two paragraph drafts", "Teacher note from May 31"]
      },
      {
        subject: "Class Participation",
        currentFocus: "Asking for help before frustration builds",
        confidence: "growing",
        progressNote: "She asked one clarifying question during group work this week.",
        evidence: ["Teacher observation", "Group activity note"]
      }
    ],
    strengths: [
      {
        id: "strength-reading",
        area: "reading",
        title: "Reading reflection is becoming more specific",
        explanation: "Mia is moving from short answers to clearer explanations of what happened in a passage.",
        parentAction: "Ask her to tell you one detail that changed how she understood the story.",
        attentionLevel: "steady",
        evidenceCount: 3
      },
      {
        id: "strength-writing",
        area: "writing",
        title: "Planning before writing is helping",
        explanation: "A small outline is making her writing calmer and easier to follow.",
        parentAction: "Celebrate the outline before reading the final paragraph.",
        attentionLevel: "steady",
        evidenceCount: 2
      }
    ],
    practiceNeeds: [
      {
        id: "practice-math-steps",
        area: "math",
        title: "Show the steps, not just the answer",
        explanation: "Mia understands many parts of the work, but skipped steps make it harder to see where support is needed.",
        parentAction: "Pick one math problem and ask her to explain the first step out loud.",
        attentionLevel: "needs-support",
        evidenceCount: 4
      },
      {
        id: "practice-homework-routine",
        area: "homework-consistency",
        title: "Make homework start time predictable",
        explanation: "The work is stronger when the routine starts before she is tired.",
        parentAction: "Try a 20-minute homework start window after a snack.",
        attentionLevel: "watch",
        evidenceCount: 3
      }
    ],
    monitorAreas: [
      {
        id: "monitor-focus",
        area: "focus",
        title: "Focus dips near the end of longer tasks",
        explanation: "This is a pattern to watch, not a reason to worry. Short breaks may help her finish with more care.",
        parentAction: "Notice whether a two-minute reset helps before the final question.",
        attentionLevel: "watch",
        evidenceCount: 2
      },
      {
        id: "monitor-participation",
        area: "participation",
        title: "Help-seeking is improving but still early",
        explanation: "She asked for help once this week. More examples will show whether this is becoming comfortable.",
        parentAction: "Ask what made it easier to ask a question in class.",
        attentionLevel: "steady",
        evidenceCount: 1
      }
    ],
    discussionPrompts: {
      child: [
        "What part of math felt easiest this week?",
        "When did reading feel more interesting?",
        "What helped you ask a question in class?"
      ],
      teacher: [
        "Are short breaks helping Mia finish longer tasks?",
        "Which math step should home practice focus on first?",
        "Is Mia ready for a slightly harder reading reflection?"
      ]
    },
    supportPlan: [
      {
        id: "support-emotional",
        area: "well-being",
        title: "Keep feedback calm and specific",
        explanation: "Mia responds best when the support names one thing she did well and one thing to try next.",
        parentAction: "Use this sentence: I noticed the step you wrote. Let us add the next one together.",
        attentionLevel: "steady",
        evidenceCount: 2
      },
      {
        id: "support-routine",
        area: "homework-consistency",
        title: "Use a small routine before practice",
        explanation: "A predictable start makes practice feel less like a surprise.",
        parentAction: "Set out pencil, timer, and one example before starting.",
        attentionLevel: "watch",
        evidenceCount: 3
      }
    ],
    teacherNotes: [
      {
        id: "note-1",
        date: "2026-06-02",
        author: "Ana Martins",
        note: "Mia explained her reading answer with more detail today. Math steps still need gentle repetition."
      },
      {
        id: "note-2",
        date: "2026-05-31",
        author: "Ana Martins",
        note: "She stayed with a writing plan for the whole draft after using a short outline."
      }
    ],
    recentChanges: [
      {
        id: "change-reading",
        date: "2026-06-02",
        label: "Reading explanation improved",
        detail: "Mia gave two supporting details instead of one.",
        attentionLevel: "steady"
      },
      {
        id: "change-focus",
        date: "2026-06-01",
        label: "Focus faded during longer math work",
        detail: "She completed the first two parts carefully, then rushed the final part.",
        attentionLevel: "watch"
      },
      {
        id: "change-homework",
        date: "2026-05-30",
        label: "Homework was stronger after an earlier start",
        detail: "The work had fewer skipped steps when practice started before dinner.",
        attentionLevel: "steady"
      }
    ],
    learningReview: {
      changed: [
        "Reading answers now include more detail.",
        "Help-seeking appeared once during group work."
      ],
      improved: [
        "Writing plans are becoming easier to follow.",
        "Homework quality improved with an earlier routine."
      ],
      stable: [
        "Attendance remains consistent.",
        "Mia is still completing core assignments."
      ],
      stillNeedsProof: [
        "Whether short breaks help on long math tasks.",
        "Whether asking questions becomes comfortable across subjects."
      ]
    },
    recommendedNextStep: {
      title: "Read together for 15 minutes three times this week.",
      detail: "After each reading time, ask Mia to share one detail that changed her understanding.",
      whyNow: "Reading confidence is growing, and short shared practice can strengthen the pattern."
    },
    decisionQuality: {
      supportingEvidence: [
        "Two reading reflections now include supporting details.",
        "Writing drafts are clearer after a short outline.",
        "Homework samples were stronger after an earlier start."
      ],
      assumptions: [
        "Short reading practice at home will feel calm enough to repeat.",
        "The latest classroom note reflects Mia's current comfort level."
      ],
      contradictoryIndicators: [
        "Focus still fades near the end of longer math work.",
        "Help-seeking has appeared once, but not yet across subjects."
      ],
      unknowns: [
        "Whether short breaks improve long math tasks.",
        "Whether asking questions becomes comfortable without prompting."
      ],
      lessons: [
        "Specific feedback works better than broad encouragement.",
        "Earlier routines appear to protect homework quality."
      ],
      nextActions: [
        "Keep reading practice short and specific.",
        "Ask the teacher which math step should be reviewed first."
      ],
      nextBestEvidence: {
        title: "One fresh math sample after a two-minute reset",
        whyItMatters: "It would show whether the focus support changes the actual work, not just the mood.",
        expectedImpact: "Clarifies whether home practice should add short breaks before harder problems."
      }
    },
    evidenceHistory: [
      {
        id: "evidence-1",
        date: "2026-06-02",
        area: "reading",
        summary: "Two supporting details in a reading reflection.",
        confidence: "confirmed"
      },
      {
        id: "evidence-2",
        date: "2026-06-01",
        area: "math",
        summary: "Skipped final written step during multi-step practice.",
        confidence: "repeated"
      },
      {
        id: "evidence-3",
        date: "2026-05-31",
        area: "writing",
        summary: "Used an outline before drafting.",
        confidence: "repeated"
      },
      {
        id: "evidence-4",
        date: "2026-05-30",
        area: "homework-consistency",
        summary: "Earlier start was followed by more complete work.",
        confidence: "early"
      }
    ],
    dashboardPermissions: {
      studentId: "student-mia-rivera",
      canViewParentDashboard: true,
      validatedParentEmail: "parent.rivera@example.com",
      validatedAt: "2026-06-02T14:00:00.000Z"
    }
  },
  {
    student: {
      id: "student-noah-patel",
      childName: "Noah Patel",
      childEmail: "noah.patel@student.algai.test",
      grade: "Grade 3",
      className: "Third Grade Builders",
      teacher: {
        id: "teacher-ana-martins",
        name: "Ana Martins",
        email: "ana.martins@algai.school"
      },
      lastUpdate: "2026-06-02T13:30:00.000Z"
    },
    accessStatus: "validated-parent",
    subjects: [
      {
        subject: "Math",
        currentFocus: "Explaining number patterns",
        confidence: "steady",
        progressNote: "Noah is spotting patterns more quickly when he names each step.",
        evidence: ["Pattern activity completed", "One reflection saved in AlgAI"]
      },
      {
        subject: "Reading",
        currentFocus: "Slowing down for unfamiliar words",
        confidence: "growing",
        progressNote: "He is using context clues before asking for the word.",
        evidence: ["Reading note from June 2"]
      }
    ],
    strengths: [
      {
        id: "noah-strength-patterns",
        area: "math",
        title: "Pattern language is getting clearer",
        explanation: "Noah is using more precise words when he explains what changes in a sequence.",
        parentAction: "Ask him to name the rule before solving the next item.",
        attentionLevel: "steady",
        evidenceCount: 2
      }
    ],
    practiceNeeds: [
      {
        id: "noah-practice-reading",
        area: "reading",
        title: "Pause before guessing at new words",
        explanation: "A short pause helps Noah use context before moving on.",
        parentAction: "Point to the sentence and ask what word would make sense there.",
        attentionLevel: "watch",
        evidenceCount: 1
      }
    ],
    monitorAreas: [],
    discussionPrompts: {
      child: ["What pattern did you notice first today?"],
      teacher: ["Which reading clue should home practice reinforce?"]
    },
    supportPlan: [
      {
        id: "noah-support-patterns",
        area: "participation",
        title: "Let him explain the rule out loud",
        explanation: "Saying the rule helps Noah check whether the pattern still works.",
        parentAction: "Ask for the rule before the answer.",
        attentionLevel: "steady",
        evidenceCount: 2
      }
    ],
    teacherNotes: [],
    recentChanges: [
      {
        id: "noah-change-patterns",
        date: "2026-06-02",
        label: "Pattern explanation became more specific",
        detail: "Noah named the change before writing the answer.",
        attentionLevel: "steady"
      }
    ],
    learningReview: {
      changed: ["Pattern explanations are more specific."],
      improved: ["He is pausing more often before guessing."],
      stable: ["Noah is completing short AlgAI practice sessions."],
      stillNeedsProof: ["Whether the reading pause carries into longer passages."]
    },
    recommendedNextStep: {
      title: "Practice one short pattern together.",
      detail: "Ask Noah to say the rule before solving the final item.",
      whyNow: "The evidence shows that spoken rules help him check his thinking."
    },
    decisionQuality: {
      supportingEvidence: [
        "Noah named the rule during a number pattern activity.",
        "One AlgAI reflection shows clearer pattern language."
      ],
      assumptions: [
        "Saying the rule out loud will transfer to similar short problems."
      ],
      contradictoryIndicators: [
        "Reading pause evidence is still early and may not hold in longer passages."
      ],
      unknowns: [
        "Which reading clue should home practice reinforce first.",
        "Whether the pattern explanation holds when the sequence gets harder."
      ],
      lessons: [
        "Spoken rules help Noah check his thinking before answering."
      ],
      nextActions: [
        "Use one short pattern instead of a long worksheet.",
        "Ask for the rule before the final answer."
      ],
      nextBestEvidence: {
        title: "A second pattern activity with a harder final item",
        whyItMatters: "It would show whether the pattern language survives a small increase in difficulty.",
        expectedImpact: "Helps decide whether to keep practicing the same skill or move on."
      }
    },
    evidenceHistory: [
      {
        id: "noah-evidence-1",
        date: "2026-06-02",
        area: "math",
        summary: "Named the rule in a number pattern.",
        confidence: "confirmed"
      }
    ],
    dashboardPermissions: {
      studentId: "student-noah-patel",
      canViewParentDashboard: true,
      validatedParentEmail: "parent.rivera@example.com",
      validatedAt: "2026-06-02T13:30:00.000Z"
    }
  }
];
