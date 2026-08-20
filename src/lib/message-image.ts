// Where a picture-bearing message's pixels come from. Live over SSE they ride
// on the message as base64; once stored, the server strips them and answers
// `hasImage` instead, so a reloaded transcript has to fetch them back. Both
// paths end up as an <img src>, which is why the fetching one is a URL rather
// than a request: the browser already caches it, and the route marks a settled
// message's image immutable.

export interface ImageBearingMessage {
  id: string;
  png?: string;
  hasImage?: boolean;
  mime?: string;
}

export function messageImageSrc(threadId: string, message: ImageBearingMessage): string | null {
  if (message.png) return `data:${message.mime ?? "image/png"};base64,${message.png}`;
  if (!message.hasImage) return null;
  return `/api/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(message.id)}/image`;
}
