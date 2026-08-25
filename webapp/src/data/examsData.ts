import { Exam, Question, ExamAttempt } from '../types';

export const APEX_QUESTIONS: Question[] = [
  {
    id: 'apex-q1',
    s: 'Physics',
    type: 'Diagram question',
    diagram: true,
    diagramType: 'prism',
    difficulty: 'Medium',
    t: 'In the triangular glass prism shown, the incident ray enters the first surface and emerges through the second surface. The emergent ray bends toward which side of the normal at the second refracting face?',
    o: [
      'Toward the normal',
      'Away from the normal',
      'Along the normal without deviation',
      'Undergoes total internal reflection back into prism'
    ],
    a: 1,
    e: 'According to Snell\'s law of refraction, when light travels from an optically denser medium (glass, n ≈ 1.5) into an optically rarer medium (air, n ≈ 1.0), it speeds up and refracts AWAY from the normal.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'apex-q2',
    s: 'Physics',
    type: 'Calculation',
    difficulty: 'Easy',
    t: 'A body starts from rest (u = 0) and accelerates uniformly at 2 m/s² for 5 seconds. What is its final velocity?',
    o: ['5 m/s', '7 m/s', '10 m/s', '12 m/s'],
    a: 2,
    e: 'Using the first equation of motion: v = u + at = 0 + (2 m/s² × 5 s) = 10 m/s.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'apex-q3',
    s: 'Physics',
    type: 'Single correct',
    difficulty: 'Easy',
    t: 'The SI unit of electric charge is:',
    o: ['Volt (V)', 'Coulomb (C)', 'Ampere (A)', 'Ohm (Ω)'],
    a: 1,
    e: 'Electric charge (Q) is measured in Coulombs (C). Volt is the unit for electric potential, Ampere for electric current, and Ohm for electrical resistance.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'apex-q4',
    s: 'Physics',
    type: 'Single correct',
    difficulty: 'Easy',
    t: 'Which of the following physical quantities is a vector quantity (has both magnitude and specified direction)?',
    o: ['Speed', 'Distance', 'Mass', 'Displacement'],
    a: 3,
    e: 'Displacement is the shortest straight-line distance from the initial to the final position along with a direction, making it a vector quantity.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'apex-q5',
    s: 'Physics',
    type: 'Single correct',
    difficulty: 'Easy',
    t: 'The standard acceleration due to gravity near Earth\'s surface is approximately:',
    o: ['9.8 m/s²', '0.98 m/s²', '98 m/s²', '1.8 m/s²'],
    a: 0,
    e: 'The standard acceleration due to gravity (g) at sea level on Earth is approximately 9.8 m/s² (or 9.80665 m/s²).',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'apex-q6',
    s: 'Chemistry',
    type: 'Single correct',
    difficulty: 'Easy',
    t: 'The atomic number (Z) of an electrically neutral atom is strictly defined by its number of:',
    o: ['Neutrons', 'Protons', 'Nucleons', 'Electrons and neutrons combined'],
    a: 1,
    e: 'Atomic number (Z) is defined as the total number of protons present in the nucleus of an atom. In a neutral atom, this also equals the number of orbiting electrons.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'apex-q7',
    s: 'Chemistry',
    type: 'Single correct',
    difficulty: 'Easy',
    t: 'An aqueous solution with a pH value of 3 at 25°C is classified as:',
    o: ['Neutral', 'Basic / Alkaline', 'Acidic', 'Amphoteric buffer'],
    a: 2,
    e: 'On the pH scale (0–14): pH < 7 is acidic, pH = 7 is neutral, and pH > 7 is basic. Therefore, pH = 3 is strongly acidic.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'apex-q8',
    s: 'Chemistry',
    type: 'Single correct',
    difficulty: 'Medium',
    t: 'Which gas is evolved when granulated zinc reacts vigorously with dilute hydrochloric acid?',
    o: ['Oxygen gas (O₂)', 'Hydrogen gas (H₂)', 'Nitrogen gas (N₂)', 'Chlorine gas (Cl₂)'],
    a: 1,
    e: 'Chemical reaction: Zn (s) + 2HCl (aq) → ZnCl₂ (aq) + H₂ (g)↑. Hydrogen gas burns with a characteristic "pop" sound when brought near a burning splinter.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'apex-q9',
    s: 'Chemistry',
    type: 'Single correct',
    difficulty: 'Easy',
    t: 'The standard chemical symbol for Sodium is:',
    o: ['S', 'So', 'Na', 'N'],
    a: 2,
    e: 'The symbol "Na" is derived from its Latin/Neo-Latin name "Natrium". "S" represents Sulfur and "N" represents Nitrogen.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'apex-q10',
    s: 'Chemistry',
    type: 'Single correct',
    difficulty: 'Easy',
    t: 'Which of the following elements is categorized as an inert or Noble Gas (Group 18)?',
    o: ['Oxygen', 'Nitrogen', 'Neon', 'Hydrogen'],
    a: 2,
    e: 'Neon (Ne, atomic number 10) is a noble gas with a completely filled valence octet shell (configuration: 2, 8), rendering it chemically non-reactive under standard conditions.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'apex-q11',
    s: 'Biology',
    type: 'Single correct',
    difficulty: 'Easy',
    t: 'The fundamental structural and functional unit of all living organisms is the:',
    o: ['Tissue', 'Organ', 'Cell', 'Organ System'],
    a: 2,
    e: 'The cell is the basic structural, functional, and biological unit of all known living organisms, first discovered by Robert Hooke in 1665.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'apex-q12',
    s: 'Biology',
    type: 'Single correct',
    difficulty: 'Easy',
    t: 'In plant cells, the biochemical process of photosynthesis primarily takes place in which organelle?',
    o: ['Mitochondria', 'Chloroplast', 'Nucleus', 'Ribosome'],
    a: 1,
    e: 'Chloroplasts contain the green photosynthetic pigment chlorophyll, which absorbs sunlight energy to convert CO₂ and H₂O into glucose and oxygen.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'apex-q13',
    s: 'Biology',
    type: 'Single correct',
    difficulty: 'Easy',
    t: 'Which category of human blood cells is primarily responsible for defending the body against infections and pathogens?',
    o: ['Red blood cells (Erythrocytes)', 'White blood cells (Leukocytes)', 'Platelets (Thrombocytes)', 'Blood Plasma'],
    a: 1,
    e: 'White blood cells (Leukocytes), including lymphocytes, neutrophils, and macrophages, form a crucial component of the immune system to destroy invading microorganisms.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'apex-q14',
    s: 'Biology',
    type: 'Single correct',
    difficulty: 'Easy',
    t: 'What is the full biochemical name of the genetic material DNA?',
    o: [
      'Deoxyribonucleic acid',
      'Dynamic nucleic acid',
      'Double nitrogen acid',
      'Dioxyribose amine'
    ],
    a: 0,
    e: 'DNA stands for Deoxyribonucleic Acid. It consists of two polynucleotide chains coiled around each other to form a double helix containing genetic instructions.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'apex-q15',
    s: 'Biology',
    type: 'Single correct',
    difficulty: 'Easy',
    t: 'The human heart is anatomically divided into how many muscular chambers?',
    o: ['Two chambers', 'Three chambers', 'Four chambers', 'Five chambers'],
    a: 2,
    e: 'The human heart consists of 4 distinct chambers: two upper receiving chambers (right atrium and left atrium) and two lower pumping chambers (right ventricle and left ventricle).',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'apex-q16',
    s: 'Physics',
    type: 'Single correct',
    difficulty: 'Easy',
    t: 'A double convex optical lens placed in air is primarily used to:',
    o: [
      'Only diverge parallel light rays',
      'Converge parallel incident rays toward a real focal point',
      'Absorb all incoming spectrum wavelengths',
      'Reflect light identically like a plane mirror'
    ],
    a: 1,
    e: 'A convex lens is thicker in the middle than at the edges; when parallel rays of light pass through it, they refract and converge at the principal focus.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'apex-q17',
    s: 'Chemistry',
    type: 'Single correct',
    difficulty: 'Easy',
    t: 'The phase transition phenomenon where a substance transforms from a liquid into its gaseous vapor state is known as:',
    o: ['Condensation', 'Sublimation', 'Evaporation / Vaporization', 'Freezing'],
    a: 2,
    e: 'Evaporation is the vaporization of a liquid that occurs from the surface of a liquid into a gaseous phase at temperatures below its boiling point.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'apex-q18',
    s: 'Biology',
    type: 'Single correct',
    difficulty: 'Easy',
    t: 'Which vital human organ filters metabolic waste products and excess ions from the bloodstream to form urine?',
    o: ['Liver', 'Lungs', 'Kidneys (Renal system)', 'Stomach'],
    a: 2,
    e: 'The kidneys contain millions of microscopic functional filtering units called nephrons that filter blood, balance electrolytes, and excrete waste as urine.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'apex-q19',
    s: 'Physics',
    type: 'Single correct',
    difficulty: 'Easy',
    t: 'The frequency of an oscillatory sound wave or electromagnetic wave is measured in the SI unit of:',
    o: ['Joule (J)', 'Newton (N)', 'Hertz (Hz)', 'Pascal (Pa)'],
    a: 2,
    e: 'Frequency represents the number of periodic cycles per second and is measured in Hertz (Hz), named after Heinrich Hertz.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'apex-q20',
    s: 'Biology',
    type: 'Single correct',
    difficulty: 'Easy',
    t: 'In a eukaryotic cell, which prominent organelle contains the hereditary genetic material (chromosomes)?',
    o: ['Cell membrane', 'Nucleus', 'Central vacuole', 'Cell wall'],
    a: 1,
    e: 'The nucleus is the master control center of the eukaryotic cell, enveloped by a double membrane and housing genomic DNA organized in chromosomes.',
    marks: 4,
    negativeMarks: 1
  }
];

export const MATH_QUESTIONS: Question[] = [
  {
    id: 'math-q1',
    s: 'Mathematics',
    type: 'Calculation',
    difficulty: 'Easy',
    t: 'If sin θ = 3/5 in a right-angled triangle, what is the value of cos θ (for acute angle θ)?',
    o: ['4/5', '5/4', '3/4', '1/5'],
    a: 0,
    e: 'Using the identity sin²θ + cos²θ = 1: cos²θ = 1 - (3/5)² = 1 - 9/25 = 16/25 => cos θ = 4/5.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'math-q2',
    s: 'Mathematics',
    type: 'Calculation',
    difficulty: 'Medium',
    t: 'Find the roots of the quadratic equation: x² - 7x + 12 = 0',
    o: ['x = 2, 6', 'x = 3, 4', 'x = -3, -4', 'x = 1, 12'],
    a: 1,
    e: 'Factoring x² - 7x + 12: (x - 3)(x - 4) = 0 => x = 3 or x = 4.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'math-q3',
    s: 'Mathematics',
    type: 'Calculation',
    difficulty: 'Easy',
    t: 'The distance of the point P(3, 4) from the origin (0, 0) is:',
    o: ['7 units', '5 units', '25 units', '1 unit'],
    a: 1,
    e: 'Distance formula: d = √(x² + y²) = √(3² + 4²) = √(9 + 16) = √25 = 5 units.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'math-q4',
    s: 'Mathematics',
    type: 'Calculation',
    difficulty: 'Medium',
    t: 'In an Arithmetic Progression (AP) with first term a = 5 and common difference d = 3, what is the 10th term (a₁₀)?',
    o: ['30', '32', '35', '38'],
    a: 1,
    e: 'a_n = a + (n - 1)d => a₁₀ = 5 + (10 - 1)×3 = 5 + 27 = 32.',
    marks: 4,
    negativeMarks: 1
  },
  {
    id: 'math-q5',
    s: 'Mathematics',
    type: 'Calculation',
    difficulty: 'Easy',
    t: 'What is the total surface area of a solid sphere of radius r = 7 cm? (Take π = 22/7)',
    o: ['616 cm²', '154 cm²', '308 cm²', '1232 cm²'],
    a: 0,
    e: 'Surface area of sphere = 4πr² = 4 × (22/7) × 7 × 7 = 4 × 22 × 7 = 616 cm².',
    marks: 4,
    negativeMarks: 1
  }
];

export const MOCK_EXAMS: Exam[] = [
  {
    id: 'apex-01',
    title: 'Apex Mock Test 01',
    subtitle: 'Class 10 Science · Full Syllabus Practice',
    classLevel: 'Class 10 · Science Track',
    subjects: ['Physics', 'Chemistry', 'Biology'],
    durationMinutes: 30,
    totalQuestions: 20,
    totalMarks: 80,
    status: 'available',
    startTime: 'Available Anytime',
    questions: APEX_QUESTIONS,
    instructions: [
      'Total duration is 30 minutes for 20 Multiple Choice Questions.',
      'Marking Scheme: +4 Marks for each correct answer; -1 Mark for incorrect answers.',
      'You can navigate between questions freely using the Question Palette.',
      'Questions can be Marked for Review to double check before submission.',
      'An interactive rough scratchpad and formula reference card are accessible during the test.'
    ]
  },
  {
    id: 'math-weekly-01',
    title: 'Mathematics Weekly Drill 01',
    subtitle: 'Class 10 Mathematics · Algebra, Trig & Geometry',
    classLevel: 'Class 10 · Mathematics Track',
    subjects: ['Mathematics'],
    durationMinutes: 25,
    totalQuestions: 5,
    totalMarks: 20,
    status: 'available',
    startTime: 'Starts Today',
    questions: MATH_QUESTIONS,
    instructions: [
      'Total duration is 25 minutes for 5 comprehensive calculation questions.',
      'Marking Scheme: +4 Marks for each correct answer; -1 Mark for incorrect answers.',
      'Calculations should be verified using the on-screen scratchpad.'
    ]
  },
  {
    id: 'science-challenge-03',
    title: 'Weekly Science Challenge 03',
    subtitle: 'Class 10 Science · Assessment Review & Reattempt',
    classLevel: 'Class 10 · Science Track',
    subjects: ['Physics', 'Chemistry', 'Biology'],
    durationMinutes: 30,
    totalQuestions: 20,
    totalMarks: 80,
    status: 'past',
    expiryDate: '21 August',
    questions: APEX_QUESTIONS,
    instructions: [
      'This assessment concluded on 21 August with your recorded score of 72%.',
      'You can freely inspect all solutions or launch a fresh reattempt to improve your score.'
    ]
  },
  {
    id: 'math-sprint-01',
    title: 'Mathematics Target Test 01',
    subtitle: 'Class 10 Mathematics · Sprint & Target Assessment',
    classLevel: 'Class 10 · Mathematics Track',
    subjects: ['Mathematics'],
    durationMinutes: 25,
    totalQuestions: 5,
    totalMarks: 20,
    status: 'past',
    expiryDate: '19 August',
    questions: MATH_QUESTIONS,
    instructions: [
      'Completed past assessment test on trigonometry and arithmetic progressions.',
      'Reattempt or practice with instant solutions.'
    ]
  }
];

export const SAMPLE_INITIAL_ATTEMPT: ExamAttempt = {
  examId: 'apex-01',
  examTitle: 'Apex Mock Test 01',
  classLevel: 'Class 10 · Science',
  answers: [1, 2, 1, 3, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  marked: [true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  visited: [true, true, true, true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
  eliminated: {},
  secondsLeft: 1260, // 21 minutes left
  totalDurationSeconds: 1800,
  timeSpentSeconds: 540,
  startedAt: new Date(Date.now() - 540000).toISOString(),
  isSubmitted: false
};

export const SAMPLE_PAST_RESULTS: ExamAttempt[] = [
  {
    examId: 'science-challenge-03',
    examTitle: 'Weekly Science Challenge 03',
    classLevel: 'Class 10 · Science',
    answers: [1, 2, 1, 3, 0, 1, 2, 1, 2, 2, 2, 1, 1, 0, 2, 1, 2, 2, 0, 1], // 18 correct, 1 wrong, 1 skipped
    marked: [false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false],
    visited: Array(20).fill(true),
    eliminated: {},
    secondsLeft: 420,
    totalDurationSeconds: 1800,
    timeSpentSeconds: 1380,
    startedAt: new Date(Date.now() - 86400000 * 4).toISOString(),
    completedAt: new Date(Date.now() - 86400000 * 4 + 1380000).toISOString(),
    isSubmitted: true,
    score: 68,
    maxScore: 80,
    correctCount: 18,
    wrongCount: 1,
    skippedCount: 1,
    accuracy: 94,
    rank: 24,
    totalParticipants: 138
  },
  {
    examId: 'math-sprint-01',
    examTitle: 'Mathematics Target Test 01',
    classLevel: 'Class 10 · Mathematics',
    answers: [1, 1, 2, 1, 1], // 5 correct out of 5
    marked: [false, false, false, false, false],
    visited: Array(5).fill(true),
    eliminated: {},
    secondsLeft: 600,
    totalDurationSeconds: 1500,
    timeSpentSeconds: 900,
    startedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    completedAt: new Date(Date.now() - 86400000 * 2 + 900000).toISOString(),
    isSubmitted: true,
    score: 20,
    maxScore: 20,
    correctCount: 5,
    wrongCount: 0,
    skippedCount: 0,
    accuracy: 100,
    rank: 4,
    totalParticipants: 92
  }
];

export const SAMPLE_PAST_RESULT: ExamAttempt = SAMPLE_PAST_RESULTS[0];

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: string;
  accuracy: string;
  time: string;
  badge?: string;
  isUser?: boolean;
}

export const EXAM_LEADERBOARDS: Record<string, LeaderboardEntry[]> = {
  'science-challenge-03': [
    { rank: 1, name: 'Aarav Mukherjee', score: '80 / 80', accuracy: '100%', time: '18m 12s', badge: '🥇 1st' },
    { rank: 2, name: 'Tanvi Deshmukh', score: '76 / 80', accuracy: '95%', time: '21m 40s', badge: '🥈 2nd' },
    { rank: 3, name: 'Kunal Sen', score: '76 / 80', accuracy: '95%', time: '22m 15s', badge: '🥉 3rd' },
    { rank: 4, name: 'Ananya Gupta', score: '72 / 80', accuracy: '90%', time: '24m 02s', badge: 'Top 5%' },
    { rank: 5, name: 'Rohan Verma', score: '72 / 80', accuracy: '90%', time: '25m 30s' },
    { rank: 6, name: 'Pooja Iyer', score: '70 / 80', accuracy: '88%', time: '26m 10s' },
    { rank: 24, name: 'Pusparghya Manna (You)', score: '68 / 80', accuracy: '94%', time: '23m 00s', badge: 'Top 18%', isUser: true }
  ],
  'math-sprint-01': [
    { rank: 1, name: 'Siddharth Roy', score: '20 / 20', accuracy: '100%', time: '11m 45s', badge: '🥇 1st' },
    { rank: 2, name: 'Meera Patel', score: '20 / 20', accuracy: '100%', time: '12m 30s', badge: '🥈 2nd' },
    { rank: 3, name: 'Aarav Mukherjee', score: '20 / 20', accuracy: '100%', time: '13m 10s', badge: '🥉 3rd' },
    { rank: 4, name: 'Pusparghya Manna (You)', score: '20 / 20', accuracy: '100%', time: '15m 00s', badge: 'Top 5%', isUser: true },
    { rank: 5, name: 'Isha Nair', score: '16 / 20', accuracy: '80%', time: '17m 22s' },
    { rank: 6, name: 'Kunal Sen', score: '16 / 20', accuracy: '80%', time: '18m 50s' }
  ],
  'apex-01': [
    { rank: 1, name: 'Kavita Ghosh', score: '80 / 80', accuracy: '100%', time: '19m 20s', badge: '🥇 1st' },
    { rank: 2, name: 'Aarav Mukherjee', score: '76 / 80', accuracy: '95%', time: '20m 50s', badge: '🥈 2nd' },
    { rank: 3, name: 'Pusparghya Manna (You)', score: '72 / 80', accuracy: '90%', time: '22m 10s', badge: '🥉 3rd', isUser: true },
    { rank: 4, name: 'Tanvi Deshmukh', score: '70 / 80', accuracy: '88%', time: '23m 40s' },
    { rank: 5, name: 'Aditya Rao', score: '68 / 80', accuracy: '85%', time: '24m 15s' }
  ],
  'math-weekly-01': [
    { rank: 1, name: 'Meera Patel', score: '20 / 20', accuracy: '100%', time: '12m 10s', badge: '🥇 1st' },
    { rank: 2, name: 'Siddharth Roy', score: '20 / 20', accuracy: '100%', time: '13m 40s', badge: '🥈 2nd' },
    { rank: 3, name: 'Aarav Mukherjee', score: '16 / 20', accuracy: '80%', time: '14m 20s', badge: '🥉 3rd' },
    { rank: 4, name: 'Pusparghya Manna (You)', score: '16 / 20', accuracy: '80%', time: '16m 05s', badge: 'Top 10%', isUser: true },
    { rank: 5, name: 'Rohan Verma', score: '12 / 20', accuracy: '60%', time: '17m 30s' }
  ]
};

export const LEADERBOARD_BENCHMARKS = EXAM_LEADERBOARDS['science-challenge-03'];

export const FORMULA_CONSTANTS = [
  { category: 'Physics', title: 'Equations of Motion', items: ['v = u + at', 's = ut + ½at²', 'v² = u² + 2as'] },
  { category: 'Physics', title: 'Optics & Snell\'s Law', items: ['1/f = 1/v - 1/u (Lens)', 'n₁ sin θ₁ = n₂ sin θ₂', 'P = 1/f (in meters)'] },
  { category: 'Physics', title: 'Electricity & Constants', items: ['V = I × R (Ohm\'s Law)', 'P = V × I = I²R', 'g = 9.8 m/s²', 'c = 3 × 10⁸ m/s'] },
  { category: 'Chemistry', title: 'pH & Molarity', items: ['pH = -log₁₀[H⁺]', 'Acid + Base → Salt + Water', 'Zn + 2HCl → ZnCl₂ + H₂↑'] },
  { category: 'Mathematics', title: 'Trigonometry & Algebra', items: ['sin²θ + cos²θ = 1', 'Quadratic: x = (-b ± √(b²-4ac)) / 2a', 'Sphere Area = 4πr²'] }
];
