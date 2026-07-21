// Stateless proxy: holds the GitHub PAT as a Worker secret so it never reaches
// the browser. Its only job is to relay a save-recipe request as a
// repository_dispatch event. All actual sanitization/writing happens in the
// GitHub Actions workflow (.github/workflows/save-recipe.yml) using the
// run's own short-lived GITHUB_TOKEN — this PAT never touches that workflow.

const ALLOWED_ORIGIN = 'https://swoodcock.github.io';
const GITHUB_REPO = 'swoodcock/JYS.FamilyMealPlan';
const MAX_BODY_BYTES = 60 * 1024; // GitHub's client_payload cap is 64KB

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders() });
    }

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return new Response('Payload too large', { status: 413, headers: corsHeaders() });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      return new Response('Invalid JSON', { status: 400, headers: corsHeaders() });
    }

    if (!payload.recipe_id || !payload.recipe_html) {
      return new Response('Missing recipe_id or recipe_html', { status: 400, headers: corsHeaders() });
    }

    const ghResp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GITHUB_PAT}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'family-meal-plan-save-worker',
      },
      body: JSON.stringify({
        event_type: 'save-recipe',
        client_payload: {
          recipe_id: String(payload.recipe_id).slice(0, 40),
          recipe_html: String(payload.recipe_html).slice(0, 40000),
          notes: String(payload.notes || '').slice(0, 300),
        },
      }),
    });

    return new Response(JSON.stringify({ ok: ghResp.ok }), {
      status: ghResp.ok ? 200 : 502,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    });
  },
};
