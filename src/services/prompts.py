FLASHCARD_PROMPT_TEMPLATE = r"""
You are an expert tutor creating flashcards for spaced repetition.
Based on the following text, create {count} flashcards.
Each flashcard should focus on a single key concept, fact, or definition.
Avoid complex or ambiguous questions.
Use LaTeX for math notation (e.g. \( ... \) for inline, \[ ... \] for block equations).
The output must be a valid JSON array of objects with "front" and "back" keys.

Text:
{text}

Output format:
[
  {{"front": "Question or term", "back": "Answer or definition"}},
  ...
]
"""

QUESTION_PROMPT_TEMPLATE = r"""
You are an expert teacher creating a quiz to test understanding of the following text.
Create {count} multiple-choice questions.
Each question should check for comprehension of key concepts.
Use LaTeX for math notation (e.g. \( ... \) for inline, \[ ... \] for block equations).
The output must be a valid JSON array of objects.

Text:
{text}

Output format:
[
  {{
    "question": "The question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "Option A",
    "explanation": "Why this is correct"
  }},
  ...
]
"""

LEARNING_PATH_PROMPT_TEMPLATE = """
You are an expert learning curriculum designer.
Create a personalized learning path for a student based on their goal and the provided content.
Break down the topic into logical steps or modules.
The output must be a valid JSON object.

Goal: {goal}

Context/Content:
{text}

Output format:
{{
  "title": "Learning Path Title",
  "description": "Brief description of the path",
  "steps": [
    {{
      "title": "Module/Step Title",
      "description": "What to learn in this step",
      "estimated_time": "e.g., 30 mins",
      "resources": ["Key concepts to search for"]
    }},
    ...
  ]
}}
"""

ENHANCED_CURRICULUM_PROMPT_TEMPLATE = """
You are an elite learning architect. Your task is to design a high-performance "Neural Pathway" (curriculum) for a student.
A good curriculum follows the principles of:
1. **Knowledge Priming**: Start with big-picture mental models.
2. **Active Engagement**: Interleave reading with retrieval practice.
3. **Scaffolding**: Build from fundamental to complex concepts.

Goal: {goal}

Context/Source Material:
{text}

Generate a structured curriculum with 4-7 modules. Each module MUST have one of these types:
- `PRIMER`: High-level synthesis and conceptual overview.
- `READING`: Deep dive into specific sections of the context.
- `PRACTICE`: Active recall via quizzes or self-explanation prompts.
- `SRS`: Unlocking specific flashcards for long-term retention.

IMPORTANT: The output must be a valid JSON object. Do not include markdown formatting outside the JSON string values.

Output format:
{{
  "title": "Path Title",
  "description": "Executive summary of the learning journey",
  "estimated_total_time": "e.g., 2 hours",
  "modules": [
    {{
      "title": "Module Title",
      "description": "Why this module is next",
      "module_type": "PRIMER | READING | PRACTICE | SRS",
      "content": "Content for this module. For PRIMER/READING, this can be a markdown string. For PRACTICE/SRS, this can be a JSON string of questions/cards.",
      "estimated_time": "e.g., 15 mins"
    }}
  ]
}}
"""

CONCEPT_EXTRACTION_PROMPT_TEMPLATE = """
You are a knowledge engineer. Your task is to extract core concepts and their relationships from the provided text to build a knowledge graph.
Identify the most important atomic concepts and how they relate to each other (e.g., "is a prerequisite for", "is a sub-concept of", "is an example of").

Text:
{text}

Output format:
{{
  "nodes": [
    {{"id": "Unique Concept ID", "label": "Full Concept Name", "description": "Short explanation"}}
  ],
  "edges": [
    {{"from": "Source Concept ID", "to": "Target Concept ID", "relationship": "Relationship Type"}}
  ]
}}
"""

MODULE_CONTENT_PROMPT_TEMPLATE = """
You are an expert tutor. Your task is to generate high-quality learning content for a specific module in a curriculum.

Goal: {goal}
Module Title: {module_title}
Module Description: {module_description}
Module Type: {module_type}

Context/Source Material:
{text}

Based on the module type, generate the following:
- If `PRIMER` or `READING`: Provide a substantial, well-formatted markdown text explaining the concepts.
- If `PRACTICE`: Provide a JSON list of 5-10 multiple-choice questions or active recall prompts. Each should have a "question", "options" (for MCQ), "correct_answer", and "explanation".
- If `SRS`: Provide a JSON list of 5-10 flashcards. Each should have a "front" and "back".

Output only the content itself. If it's JSON, ensure it's valid JSON.
"""


WEEKLY_CURRICULUM_PROMPT_TEMPLATE = r"""
You are an elite learning architect. Design a week-by-week plan that is grounded in the provided documents and concept graph.
Do NOT introduce new sources. If LLM enhancement is enabled, add explanations or examples only.

Goal: {goal}
Time Budget: {hours_per_week} hours/week for {duration_weeks} weeks
Start Date: {start_date}
Prerequisites (if any): {prereqs}

Available Documents (use their ids when linking tasks/checkpoints):
{documents}

Context/Source Material:
{text}

Return strict JSON with this format:
{{
  "title": "Plan title",
  "description": "1-2 sentence overview",
  "weeks": [
    {{
      "week_index": 1,
      "goal": "Focus goal",
      "focus_concepts": ["concept 1", "concept 2"],
      "estimated_hours": 5,
      "tasks": [
        {{
          "title": "Task title",
          "task_type": "reading | practice | quiz | graph | review",
          "linked_doc_ids": [1, 2],
          "estimate_minutes": 45,
          "notes": "Optional explanation or example"
        }}
      ],
      "checkpoints": [
        {{
          "title": "Checkpoint title",
          "success_criteria": "Measurable success criteria",
          "assessment_type": "recall | quiz | summary",
          "linked_doc_ids": [1],
          "due_offset_days": 7
        }}
      ]
    }}
  ]
}}
"""


CLOZE_GENERATION_PROMPT_TEMPLATE = r"""
You are an expert tutor creating short recall passages for a student.
From the text below, generate {count} short, logically complete passages.
Each passage should be 2-5 sentences and focused on a single concept.
For each passage, produce a masked (cloze) version where key terms are replaced with [[blank_1]], [[blank_2]], etc.
Also return an answer_key list with the key ideas (not verbatim), 2-5 bullets.
Return a JSON array of objects with keys: passage_markdown, masked_markdown, answer_key.

Text:
{text}

Output format:
[
  {{
    "passage_markdown": "...",
    "masked_markdown": "...",
    "answer_key": ["idea 1", "idea 2"]
  }}
]
"""

RECALL_GRADING_PROMPT_TEMPLATE = r"""
You are an expert grader for learning recall.
Given the reference passage and the student's response, score semantic recall from 0 to 1.
Be lenient on phrasing; grade on key ideas. Provide feedback and a list of matched ideas.
Return JSON with: score (0-1), feedback (short), matched (list), missing (list).

Reference Passage:
{passage}

Expected Key Ideas:
{answer_key}

Student Response:
{response}

Output format:
{{
  "score": 0.8,
  "feedback": "...",
  "matched": ["..."],
  "missing": ["..."]
}}
"""
