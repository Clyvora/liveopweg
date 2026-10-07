const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#16364d"/>
  <path d="M16 17h8v20.5c0 5.2 2.7 8.2 8 8.2s8-3 8-8.2V17h8v20.8C48 48.1 42 55 32 55s-16-6.9-16-17.2V17Z" fill="#fff"/>
  <circle cx="32" cy="12" r="4" fill="#ffc917"/>
</svg>`;

export function GET(): Response {
  return new Response(favicon, {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
  });
}
