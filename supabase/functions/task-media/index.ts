/**
 * Görev medyasına yönlendirme (depoda imzalı URL).
 * GET …/task-media?task_id=<uuid>
 * Header: Authorization: Bearer <user JWT>
 *
 * Not: <img src> isteklerinde Authorization gönderilemez; bu durumda
 * uygulama önce fetch + blob URL veya görevdeki public image_url kullanır.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';

// CORS başlıkları (tarayıcıdan GET; preflight OPTIONS)
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, prefer, accept, accept-profile, content-profile, range',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, Content-Type',
};

Deno.serve(async (req) => {
  // 1. OPTIONS (preflight): anında CORS izinleri — gövdesiz 204
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...corsHeaders, 'Access-Control-Max-Age': '86400' },
    });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 2. JWT: config.toml verify_jwt=false; oturum createClient + auth.getUser() ile doğrulanır.

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Sunucu yapılandırması eksik' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    const queryToken = url.searchParams.get('access_token')?.trim() ?? '';
    const authHeader =
      (req.headers.get('Authorization')?.trim() ||
        (queryToken ? `Bearer ${queryToken}` : '')) ||
      '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authErr,
    } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Oturum gerekli' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const taskId = url.searchParams.get('task_id')?.trim();
    const wantStream = url.searchParams.get('stream') === '1';
    if (!taskId) {
      return new Response(JSON.stringify({ error: 'task_id gerekli' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: task, error: selErr } = await userClient
      .from('tasks')
      .select('id, type, image_url, audio_url, video_url, media_storage_path')
      .eq('id', taskId)
      .maybeSingle();

    if (selErr || !task) {
      return new Response(JSON.stringify({ error: 'Görev bulunamadı veya erişim yok' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const storagePath =
      typeof task.media_storage_path === 'string' && task.media_storage_path.trim()
        ? task.media_storage_path.trim()
        : null;

    let targetUrl: string | null = null;

    if (storagePath) {
      const { data: signed, error: signErr } = await admin.storage
        .from('task-assets')
        .createSignedUrl(storagePath, 3600);
      if (signErr || !signed?.signedUrl) {
        return new Response(JSON.stringify({ error: signErr?.message || 'İmzalı URL oluşturulamadı' }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      targetUrl = signed.signedUrl;
    } else {
      const t = task.type?.toString().toLowerCase() ?? '';
      const target =
        (t === 'video' && task.video_url) ||
        (t === 'audio' && task.audio_url) ||
        (t === 'image' && task.image_url) ||
        task.image_url ||
        task.video_url ||
        task.audio_url ||
        null;
      if (!target) {
        return new Response(JSON.stringify({ error: 'Bu görevde medya URL’i yok' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      targetUrl = String(target).trim();
    }

    if (wantStream && targetUrl) {
      const range = req.headers.get('Range') ?? '';
      const upstreamHeaders = new Headers();
      if (range) upstreamHeaders.set('Range', range);
      const upstream = await fetch(targetUrl, { headers: upstreamHeaders });
      const outHeaders = new Headers(corsHeaders);
      const copy = ['Content-Type', 'Accept-Ranges', 'Content-Range', 'Content-Length', 'Cache-Control', 'ETag'];
      for (const k of copy) {
        const v = upstream.headers.get(k);
        if (v) outHeaders.set(k, v);
      }
      return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
    }

    return Response.redirect(targetUrl, 302);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
