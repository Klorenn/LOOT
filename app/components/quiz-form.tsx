"use client";

import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire";
import { quizAnswersFromForm, quizFieldName, quizSecret, type Quiz } from "@/lib/quiz";

/**
 * Cuestionario de un cofre: una pregunta por vez. Al terminar arma el secreto canónico
 * (lib/quiz.ts) y lo entrega; las respuestas nunca salen del dispositivo.
 */
export function QuizForm({
  quiz,
  disabled,
  onSecret,
  onEdit,
}: {
  quiz: Quiz;
  disabled?: boolean;
  /** Secreto listo para el mismo flujo de prueba que un acertijo simple. */
  onSecret: (secret: string) => void;
  /** El jugador cambió alguna respuesta: el secreto anterior ya no vale. */
  onEdit?: () => void;
}) {
  const items = quiz.questions.map((q, i) => ({
    name: quizFieldName(i),
    required: true,
    ...(q.choices ? { choices: q.choices.map((c) => ({ value: c.value })) } : {}),
  }));

  return (
    <Questionnaire
      items={items}
      onChange={() => onEdit?.()}
      onSubmit={(e) => {
        e.preventDefault();
        const answers = quizAnswersFromForm(quiz, new FormData(e.currentTarget));
        try {
          onSecret(quizSecret(quiz, answers));
        } catch {
          /* la validación nativa ya marca la pregunta sin responder */
        }
      }}
    >
      <QuestionnaireProgress />
      {quiz.questions.map((q, i) => (
        <QuestionnaireItem
          key={quizFieldName(i)}
          name={quizFieldName(i)}
          required
          multiple={q.kind === "multiple"}
          disabled={disabled}
        >
          <QuestionnaireTitle>{q.prompt}</QuestionnaireTitle>
          {(q.description || q.kind === "multiple") && (
            <QuestionnaireDescription>
              {q.description || "Pick every answer that applies."}
            </QuestionnaireDescription>
          )}
          {q.kind === "text" ? (
            <QuestionnaireInput
              aria-label={q.prompt}
              placeholder="type your answer"
              autoComplete="off"
              spellCheck={false}
            />
          ) : (
            <QuestionnaireChoices>
              {q.choices!.map((c) => (
                <QuestionnaireChoice key={c.value} value={c.value}>
                  {c.label}
                </QuestionnaireChoice>
              ))}
            </QuestionnaireChoices>
          )}
          <QuestionnaireError />
        </QuestionnaireItem>
      ))}
      <QuestionnaireActions>
        <QuestionnairePrevious />
        <QuestionnaireNext />
        <QuestionnaireSubmit>Lock answers</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  );
}
