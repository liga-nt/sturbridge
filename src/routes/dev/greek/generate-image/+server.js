import { env } from '$env/dynamic/private';

export async function POST({ request }) {
  if (!env.OPENAI_API_KEY) {
    return Response.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
  }

  const { prompt, characterImageUrls = [] } = await request.json();

  if (!prompt?.trim()) {
    return Response.json({ error: 'Prompt is required' }, { status: 400 });
  }

  // If character images are provided, use the edits endpoint which accepts image references.
  // Otherwise fall back to text-only generations.
  if (characterImageUrls.length > 0) {
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', prompt.trim());
    form.append('size', '1024x1024');

    for (const url of characterImageUrls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const blob = await res.blob();
        form.append('image[]', blob, 'character.png');
      } catch (e) {
        console.warn('Failed to fetch character image:', url, e.message);
      }
    }

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: form
    });

    const data = await response.json();
    if (!response.ok) {
      return Response.json(
        { error: data.error?.message ?? 'Image generation failed' },
        { status: response.status }
      );
    }
    return Response.json({ b64_json: data.data[0].b64_json });
  }

  // Text-only path
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: prompt.trim(),
      size: '1024x1024',
      output_format: 'png'
    })
  });

  const data = await response.json();
  if (!response.ok) {
    return Response.json(
      { error: data.error?.message ?? 'Image generation failed' },
      { status: response.status }
    );
  }
  return Response.json({ b64_json: data.data[0].b64_json });
}
