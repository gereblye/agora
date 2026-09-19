"use client";

import { useTransition } from "react";
import { castVote } from "@/lib/actions";

export function VoteButtons({
  statementId,
  votesFor,
  votesAgainst,
}: {
  statementId: string;
  votesFor: number;
  votesAgainst: number;
}) {
  const [pending, startTransition] = useTransition();
  const send = (value: number) => startTransition(() => castVote(statementId, value));

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => send(1)}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:border-[var(--for)] hover:text-[var(--for)] disabled:opacity-50"
      >
        <span aria-hidden>▲</span> Agree
        <span className="tabular-nums text-muted">{votesFor}</span>
      </button>
      <button
        onClick={() => send(-1)}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:border-[var(--against)] hover:text-[var(--against)] disabled:opacity-50"
      >
        <span aria-hidden>▼</span> Disagree
        <span className="tabular-nums text-muted">{votesAgainst}</span>
      </button>
    </div>
  );
}
