"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Field,
  Input,
  Select,
  Sheet,
  SheetContent,
  Skeleton,
  Textarea,
} from "@cim/ui";
import type { MentionDetail, Tag } from "@cim/db";

const SENTIMENT_TONE = {
  positive: "success",
  neutral: "neutral",
  negative: "danger",
} as const;

// docs/architecture/ADR-006-SOCIAL-LISTENING.md — human labels for the
// typed match taxonomy; a matchType this map doesn't recognize (or null,
// for mentions created before this classification existed) falls back
// to "Not classified" rather than guessing.
const MATCH_TYPE_LABEL: Record<string, string> = {
  direct_mention: "Direct mention",
  exact_name: "Exact name",
  alias: "Alias",
  hashtag: "Hashtag",
  url: "URL",
  contextual: "Keyword context",
  semantic: "Semantic match",
};

export type AssignableMember = { userId: string; firstName: string; lastName: string };

export function MentionDetailDrawer({
  mentionId,
  members,
  existingTagNames,
  currentUserId,
  onClose,
}: {
  mentionId: string;
  members: AssignableMember[];
  existingTagNames: string[];
  currentUserId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<MentionDetail | null>(null);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [removingTagId, setRemovingTagId] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState("");
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  // mentions-table.tsx renders this drawer with no `key`, so switching rows
  // swaps `mentionId` in place rather than remounting the component — a
  // handler's own closure still sees the `mentionId` it was called with,
  // never the current one, so it can't tell on its own whether the user has
  // since moved to a different mention. A ref (always current, unlike the
  // closure) lets each handler check that after its request resolves,
  // before applying the response to `detail`/closing the drawer.
  const currentMentionIdRef = useRef(mentionId);

  useEffect(() => {
    currentMentionIdRef.current = mentionId;
    let cancelled = false;
    setDetail(null);
    // mentions-table.tsx renders this drawer with no `key`, so clicking a
    // different row while it's already open swaps `mentionId` in place
    // rather than remounting the component — without resetting these too,
    // mention A's half-typed tag/comment text or a leftover error message
    // would carry straight into mention B's drawer, and submitting it
    // would silently act on B instead of A.
    setTagInput("");
    setTagError(null);
    setIsAddingTag(false);
    setRemovingTagId(null);
    setCommentInput("");
    setCommentError(null);
    setIsAddingComment(false);
    setFeedbackError(null);
    setIsSubmittingFeedback(false);
    setAssignError(null);
    setIsAssigning(false);
    fetch(`/api/mentions/${mentionId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setDetail(data);
      });
    return () => {
      cancelled = true;
    };
  }, [mentionId]);

  async function submitFeedback(feedback: "relevant" | "irrelevant" | "duplicate") {
    setFeedbackError(null);
    setIsSubmittingFeedback(true);
    try {
      const response = await fetch(`/api/mentions/${mentionId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setFeedbackError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      // The user may have switched to a different mention while this was
      // in flight — closing now would dismiss the drawer they're actively
      // viewing for a mention this submission was never about.
      if (currentMentionIdRef.current === mentionId) onClose();
      router.refresh();
    } catch {
      setFeedbackError("Something went wrong. Please try again.");
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  async function handleAssign(nextUserId: string) {
    const assignedToUserId = nextUserId || null;
    setAssignError(null);
    setIsAssigning(true);
    try {
      const response = await fetch(`/api/mentions/${mentionId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToUserId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setAssignError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      // The user may have switched to a different mention while this was
      // in flight — applying this response to `detail` now would merge
      // mention A's new assignee onto whatever mention B's drawer is
      // currently displaying.
      if (currentMentionIdRef.current === mentionId) {
        const assignee = members.find((m) => m.userId === assignedToUserId);
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                mention: { ...prev.mention, assignedToUserId },
                assigneeName: assignee
                  ? `${assignee.firstName} ${assignee.lastName}`
                  : null,
              }
            : prev,
        );
      }
      router.refresh();
    } catch {
      setAssignError("Something went wrong. Please try again.");
    } finally {
      setIsAssigning(false);
    }
  }

  async function addTag() {
    const name = tagInput.trim();
    if (!name) return;
    setTagError(null);
    setIsAddingTag(true);
    try {
      const response = await fetch(`/api/mentions/${mentionId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setTagError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      const tag: Tag = await response.json();
      // The user may have switched to a different mention while this was
      // in flight — applying this response to `detail` now would attach
      // mention A's new tag to whatever mention B's drawer is displaying.
      if (currentMentionIdRef.current === mentionId) {
        setDetail((prev) =>
          prev && !prev.tags.some((t) => t.id === tag.id)
            ? {
                ...prev,
                tags: [...prev.tags, tag].sort((a, b) => a.name.localeCompare(b.name)),
              }
            : prev,
        );
        setTagInput("");
      }
      router.refresh();
    } catch {
      setTagError("Something went wrong. Please try again.");
    } finally {
      setIsAddingTag(false);
    }
  }

  async function removeTag(tagId: string) {
    // Without this guard, double-clicking × fires two DELETEs for the
    // same tag; the first succeeds and removes the row, the second finds
    // nothing left to delete and 404s — surfacing a "not found" error to
    // the user even though the tag was actually removed successfully.
    if (removingTagId === tagId) return;
    setTagError(null);
    setRemovingTagId(tagId);
    try {
      const response = await fetch(`/api/mentions/${mentionId}/tags/${tagId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setTagError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      // The user may have switched to a different mention while this was
      // in flight — filtering `detail.tags` now would remove a tag from
      // whatever mention B's drawer is currently displaying.
      if (currentMentionIdRef.current === mentionId) {
        setDetail((prev) =>
          prev ? { ...prev, tags: prev.tags.filter((t) => t.id !== tagId) } : prev,
        );
      }
      router.refresh();
    } catch {
      setTagError("Something went wrong. Please try again.");
    } finally {
      setRemovingTagId(null);
    }
  }

  async function addComment() {
    const body = commentInput.trim();
    if (!body) return;
    setCommentError(null);
    setIsAddingComment(true);
    try {
      const response = await fetch(`/api/mentions/${mentionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setCommentError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      const comment = await response.json();
      // The user may have switched to a different mention while this was
      // in flight — applying this response to `detail` now would attach
      // mention A's new comment to whatever mention B's drawer is displaying.
      if (currentMentionIdRef.current === mentionId) {
        setDetail((prev) =>
          prev ? { ...prev, comments: [...prev.comments, comment] } : prev,
        );
        setCommentInput("");
      }
      router.refresh();
    } catch {
      setCommentError("Something went wrong. Please try again.");
    } finally {
      setIsAddingComment(false);
    }
  }

  async function removeComment(commentId: string) {
    setCommentError(null);
    try {
      const response = await fetch(`/api/mentions/${mentionId}/comments/${commentId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setCommentError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      // The user may have switched to a different mention while this was
      // in flight — filtering `detail.comments` now would remove a
      // comment from whatever mention B's drawer is currently displaying.
      if (currentMentionIdRef.current === mentionId) {
        setDetail((prev) =>
          prev
            ? { ...prev, comments: prev.comments.filter((c) => c.id !== commentId) }
            : prev,
        );
      }
      router.refresh();
    } catch {
      setCommentError("Something went wrong. Please try again.");
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent title={detail?.article.title ?? "Mention"}>
        {!detail ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-6 text-sm">
            <section className="flex flex-col gap-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Source
              </p>
              <p className="text-foreground">{detail.source.name}</p>
              {detail.article.authorName ? (
                <p className="text-muted-foreground">By {detail.article.authorName}</p>
              ) : null}
              <p className="text-muted-foreground">
                Published{" "}
                {detail.article.publishedAt
                  ? new Date(detail.article.publishedAt).toLocaleString()
                  : "Unknown"}
              </p>
              <a
                href={detail.article.canonicalUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary underline underline-offset-2"
              >
                View original
              </a>
            </section>

            {detail.socialAuthor ? (
              <section className="flex flex-col gap-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Author
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-foreground">
                    {detail.socialAuthor.displayName ?? detail.socialAuthor.handle}
                  </p>
                  {detail.socialAuthor.verified ? (
                    <Badge tone="info">Verified</Badge>
                  ) : null}
                </div>
                {detail.socialAuthor.profileUrl ? (
                  <a
                    href={detail.socialAuthor.profileUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary underline underline-offset-2"
                  >
                    {detail.socialAuthor.handle}
                  </a>
                ) : (
                  <p className="text-muted-foreground">{detail.socialAuthor.handle}</p>
                )}
                <p className="text-muted-foreground">
                  Followers{" "}
                  {detail.socialAuthor.followers !== null
                    ? detail.socialAuthor.followers.toLocaleString()
                    : "Unknown"}
                </p>
              </section>
            ) : null}

            <section className="flex flex-col gap-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Why did this match?
              </p>
              <p className="text-foreground">
                Matched monitoring query &ldquo;{detail.queryName}&rdquo;
              </p>
              <div className="flex items-center gap-2">
                <Badge tone="neutral">
                  {detail.mention.matchType
                    ? (MATCH_TYPE_LABEL[detail.mention.matchType] ??
                      detail.mention.matchType)
                    : "Not classified"}
                </Badge>
                {detail.mention.matchType === "semantic" ? (
                  <span className="text-xs text-muted-foreground">
                    Confidence{" "}
                    {detail.mention.matchConfidence
                      ? `${Math.round(Number(detail.mention.matchConfidence) * 100)}%`
                      : "Not available"}
                  </span>
                ) : null}
              </div>
              {detail.mention.matchedRule ? (
                <p className="text-muted-foreground">{detail.mention.matchedRule}</p>
              ) : null}
              {detail.mention.matchedTerms.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {detail.mention.matchedTerms.map((term) => (
                    <Badge key={term} tone="info">
                      {term}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </section>

            {detail.relatedArticles.length > 0 ? (
              <section className="flex flex-col gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Related coverage
                </p>
                <p className="text-xs text-muted-foreground">
                  Other sources with a similar headline — a potential connection, not a
                  confirmed one.
                </p>
                <ul className="flex flex-col gap-2">
                  {detail.relatedArticles.map((related) => (
                    <li key={related.id} className="text-sm">
                      <a
                        href={related.canonicalUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-primary underline underline-offset-2"
                      >
                        {related.title}
                      </a>
                      <p className="text-xs text-muted-foreground">
                        {related.sourceName} · {related.sourceType} ·{" "}
                        {new Date(
                          related.publishedAt ?? related.fetchedAt,
                        ).toLocaleDateString()}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Sentiment
                </p>
                {detail.mention.sentiment ? (
                  <Badge
                    tone={
                      SENTIMENT_TONE[
                        detail.mention.sentiment as keyof typeof SENTIMENT_TONE
                      ]
                    }
                  >
                    {detail.mention.sentiment}
                  </Badge>
                ) : (
                  <Badge tone="neutral">Unclassified</Badge>
                )}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Engagement
                </p>
                <p className="text-muted-foreground">Not available</p>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                AI summary
              </p>
              {detail.mention.aiStatus === "completed" ? (
                <>
                  <p className="text-foreground">{detail.mention.aiSummary}</p>
                  <p className="text-xs text-muted-foreground">
                    Confidence{" "}
                    {detail.mention.sentimentConfidence
                      ? `${Math.round(Number(detail.mention.sentimentConfidence) * 100)}%`
                      : "Not available"}{" "}
                    · Method: {detail.mention.aiMethod ?? "Not available"}
                  </p>
                </>
              ) : detail.mention.aiStatus === "failed" ? (
                <p className="text-muted-foreground">
                  Not available — AI enrichment failed for this item.
                </p>
              ) : detail.mention.aiStatus === "skipped" ? (
                <p className="text-muted-foreground">
                  Not available — this source&apos;s content rights don&apos;t permit AI
                  processing.
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Not available — AI enrichment is still in progress.
                </p>
              )}

              {detail.aiEntities.length > 0 ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Entities
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {detail.aiEntities.map((entity) => (
                      <Badge key={entity.name} tone="neutral">
                        {entity.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {detail.aiTopics.length > 0 ? (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Topics
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {detail.aiTopics.map((topic) => (
                      <Badge key={topic.name} tone="info">
                        {topic.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="flex flex-col gap-2 border-t border-border pt-4">
              <Field
                id="mention-assignee"
                label="Assigned to"
                className="max-w-xs"
                error={assignError ?? undefined}
              >
                <Select
                  value={detail.mention.assignedToUserId ?? ""}
                  disabled={isAssigning}
                  onChange={(e) => handleAssign(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.firstName} {member.lastName}
                    </option>
                  ))}
                </Select>
              </Field>
            </section>

            <section className="flex flex-col gap-2 border-t border-border pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tags
              </p>
              {detail.tags.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {detail.tags.map((tag) => (
                    <li
                      key={tag.id}
                      className="flex items-center gap-2 rounded-sm bg-secondary px-2.5 py-1 text-sm text-secondary-foreground"
                    >
                      {tag.name}
                      <button
                        type="button"
                        onClick={() => removeTag(tag.id)}
                        disabled={removingTagId === tag.id}
                        aria-label={`Remove ${tag.name}`}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                      >
                        &times;
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Add a tag…"
                  aria-label="Tag"
                  list="mention-tag-suggestions"
                  disabled={isAddingTag}
                />
                <datalist id="mention-tag-suggestions">
                  {existingTagNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isAddingTag}
                  onClick={addTag}
                >
                  Add
                </Button>
              </div>
              {tagError ? (
                <p role="alert" className="text-sm text-danger">
                  {tagError}
                </p>
              ) : null}
            </section>

            <section className="flex flex-col gap-2 border-t border-border pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Feedback
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isSubmittingFeedback}
                  onClick={() => submitFeedback("relevant")}
                >
                  Relevant
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isSubmittingFeedback}
                  onClick={() => submitFeedback("irrelevant")}
                >
                  Irrelevant
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isSubmittingFeedback}
                  onClick={() => submitFeedback("duplicate")}
                >
                  Duplicate
                </Button>
              </div>
              {feedbackError ? (
                <p role="alert" className="text-sm text-danger">
                  {feedbackError}
                </p>
              ) : null}
            </section>

            <section className="flex flex-col gap-2 border-t border-border pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Comments
              </p>
              {detail.comments.length > 0 ? (
                <ul className="flex flex-col gap-3">
                  {detail.comments.map((comment) => (
                    <li
                      key={comment.id}
                      className="rounded-md border border-border p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-medium text-foreground">
                          {comment.authorFirstName} {comment.authorLastName}
                          <span className="ml-2 font-normal text-muted-foreground">
                            {new Date(comment.createdAt).toLocaleString()}
                          </span>
                        </p>
                        {comment.authorUserId === currentUserId ? (
                          <button
                            type="button"
                            onClick={() => removeComment(comment.id)}
                            aria-label="Delete comment"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                          >
                            &times;
                          </button>
                        ) : null}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                        {comment.body}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No comments yet.</p>
              )}
              <div className="flex flex-col gap-2">
                <Textarea
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder="Leave a comment for your team…"
                  aria-label="Comment"
                  disabled={isAddingComment}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  disabled={isAddingComment || !commentInput.trim()}
                  onClick={addComment}
                >
                  Comment
                </Button>
              </div>
              {commentError ? (
                <p role="alert" className="text-sm text-danger">
                  {commentError}
                </p>
              ) : null}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
