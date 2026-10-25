"use client"

import * as React from "react"
import { Questionnaire as QuestionnairePrimitive } from "@shadcn/react/questionnaire"
import { Check } from "lucide-react"
import { cn } from "cn"

// shadcn Questionnaire (registry "questionnaire") con estilos Loot: tokens oscuros y botones btn-landing.
// Se copió a mano para no pisar components/ui/button.tsx (el CLI lo quería sobrescribir).

function Questionnaire({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Root>) {
  return (
    <QuestionnairePrimitive.Root
      data-slot="questionnaire"
      className={cn("flex w-full min-w-0 flex-col gap-4", className)}
      {...props}
    />
  )
}

function QuestionnaireProgress({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Progress>) {
  return (
    <QuestionnairePrimitive.Progress
      data-slot="questionnaire-progress"
      className={cn(
        "min-h-[1lh] w-fit min-w-[14ch] font-mono text-[12px] text-[var(--dim)] tabular-nums",
        className
      )}
      {...props}
    />
  )
}

function QuestionnaireItem({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Item>) {
  return (
    <QuestionnairePrimitive.Item
      data-slot="questionnaire-item"
      className={cn("flex min-w-0 flex-col gap-3 border-0 p-0 outline-none", className)}
      {...props}
    />
  )
}

function QuestionnaireTitle({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Title>) {
  return (
    <QuestionnairePrimitive.Title
      data-slot="questionnaire-title"
      className={cn(
        "text-[15px] leading-snug font-medium text-pretty text-[var(--text)] [&:not(:has(~[data-slot=questionnaire-description]))]:mb-1",
        className
      )}
      {...props}
    />
  )
}

function QuestionnaireDescription({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Description>) {
  return (
    <QuestionnairePrimitive.Description
      data-slot="questionnaire-description"
      className={cn("text-[13px] text-pretty text-[var(--muted)]", className)}
      {...props}
    />
  )
}

function QuestionnaireChoices({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Choices>) {
  return (
    <QuestionnairePrimitive.Choices
      data-slot="questionnaire-choices"
      className={cn("group/questionnaire-choices grid min-w-0 gap-2", className)}
      {...props}
    />
  )
}

function QuestionnaireChoice({
  children,
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Choice>) {
  return (
    <QuestionnairePrimitive.Choice
      data-slot="questionnaire-choice"
      className={cn(
        "group/questionnaire-choice relative flex min-h-11 cursor-pointer items-start gap-2.5 rounded-[10px] border border-[var(--line)] bg-[var(--s1)] px-3 py-2.5 text-start text-[14px] text-[var(--text)] transition-colors outline-none select-none hover:border-[#44414F] has-[>input:focus-visible]:border-[var(--proof)] data-invalid:border-[var(--red)] data-checked:border-[var(--proof)] data-checked:bg-[var(--s2)]",
        "data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <QuestionnairePrimitive.ChoiceInput
        data-slot="questionnaire-choice-input"
        className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden="true"
        data-slot="questionnaire-choice-indicator"
        className="pointer-events-none relative mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-[#44414F] group-data-[type=radio]/questionnaire-choice:rounded-full group-data-checked/questionnaire-choice:border-[var(--proof)] group-data-checked/questionnaire-choice:bg-[var(--proof)] group-data-checked/questionnaire-choice:text-[var(--bg)]"
      >
        <span
          data-slot="questionnaire-choice-indicator-dot"
          className="hidden size-2 rounded-full bg-[var(--bg)] group-data-[type=checkbox]/questionnaire-choice:hidden group-data-checked/questionnaire-choice:block"
        />
        <Check
          data-slot="questionnaire-choice-indicator-check"
          strokeWidth={3}
          className="hidden size-3 group-data-[type=radio]/questionnaire-choice:hidden group-data-checked/questionnaire-choice:block"
        />
      </span>
      <QuestionnairePrimitive.ChoiceLabel
        data-slot="questionnaire-choice-label"
        className="flex min-w-0 flex-1 flex-col gap-0.5 leading-snug"
      >
        {children}
      </QuestionnairePrimitive.ChoiceLabel>
      <QuestionnairePrimitive.ChoiceShortcut
        data-slot="questionnaire-choice-shortcut"
        className="pointer-events-none ms-auto hidden size-5 shrink-0 items-center justify-center rounded-md border border-[var(--line)] font-mono text-[10px] leading-none text-[var(--dim)] group-data-[shortcut]/questionnaire-choice:inline-flex"
      />
    </QuestionnairePrimitive.Choice>
  )
}

function QuestionnaireInput({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Input>) {
  return (
    <div data-slot="questionnaire-input-wrapper" className="relative w-full min-w-0">
      <QuestionnairePrimitive.Input
        data-slot="questionnaire-input"
        className={cn(
          "h-11 w-full min-w-0 rounded-[10px] border border-[var(--line)] bg-[var(--bg)] px-4 font-mono text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--dim)] focus-visible:border-[var(--proof)] aria-invalid:border-[var(--red)] disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  )
}

function QuestionnaireError({
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Error>) {
  return (
    <QuestionnairePrimitive.Error
      data-slot="questionnaire-error"
      className={cn("text-[13px] text-[var(--red)]", className)}
      {...props}
    />
  )
}

function QuestionnaireActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="questionnaire-actions"
      className={cn(
        "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2",
        className
      )}
      {...props}
    />
  )
}

function QuestionnairePrevious({
  children,
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Previous>) {
  return (
    <QuestionnairePrimitive.Previous
      data-slot="questionnaire-previous"
      className={cn(
        "btn-landing btn-landing-s btn-landing-sm col-start-1 row-start-1 justify-self-start",
        className
      )}
      {...props}
    >
      {children ?? "Back"}
    </QuestionnairePrimitive.Previous>
  )
}

function QuestionnaireNext({
  children,
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Next>) {
  return (
    <QuestionnairePrimitive.Next
      data-slot="questionnaire-next"
      className={cn(
        "btn-landing btn-landing-p btn-landing-sm col-start-2 row-start-1 justify-self-end",
        className
      )}
      {...props}
    >
      {children ?? "Next"}
    </QuestionnairePrimitive.Next>
  )
}

function QuestionnaireSubmit({
  children,
  className,
  ...props
}: React.ComponentProps<typeof QuestionnairePrimitive.Submit>) {
  return (
    <QuestionnairePrimitive.Submit
      data-slot="questionnaire-submit"
      className={cn(
        "btn-landing btn-landing-p btn-landing-sm col-start-2 row-start-1 justify-self-end",
        className
      )}
      {...props}
    >
      {children ?? "Submit"}
    </QuestionnairePrimitive.Submit>
  )
}

export {
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
}
