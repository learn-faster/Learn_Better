/**
 * Metacognitive Prompts & Constants
 * Used to guide the user through Planning, Monitoring, and Evaluating stages.
 */

export const META_STAGES = {
    PLANNING: 'planning',
    MONITORING: 'monitoring',
    EVALUATING: 'evaluating'
};

export const REFLECTIVE_PROMPTS = {
    [META_STAGES.PLANNING]: [
        "What specific concept do you want to master this session?",
        "How will you know when you've successfully learned this?",
        "What strategies will you use if you get stuck?"
    ],
    [META_STAGES.MONITORING]: [
        "Are you understanding the 'why' or just memorizing the 'what'?",
        "Can you explain the last concept in your own words?",
        "Is your current pace too fast, too slow, or just right?",
        "How does this connect to what you learned yesterday?",
        "Do you need to break this down into smaller chunks?"
    ],
    [META_STAGES.EVALUATING]: [
        "What was the most challenging part of this session?",
        "Did your study strategy work? Why or why not?",
        "What is one thing you would do differently next time?",
        "How confident do you feel about this material now?"
    ]
};

export const EFFECTIVENESS_RATINGS = [
    { value: 1, label: "Ineffective", color: "bg-red-500" },
    { value: 2, label: "Low Impact", color: "bg-orange-500" },
    { value: 3, label: "Average", color: "bg-yellow-500" },
    { value: 4, label: "Effective", color: "bg-lime-500" },
    { value: 5, label: "Highly Effective", color: "bg-green-500" }
];
