// Login corre aqui, no servidor, em vez de o cliente chamar
// /api/auth/login-guard (só um aviso) e DEPOIS chamar
// supabase.auth.signInWithPassword directamente do browser.
//
// Antes, o rate limit e o login real eram dois pedidos separados —
// nada obrigava um cliente a chamar o primeiro antes do segundo.
// Quem quisesse tentar força bruta podia simplesmente ignorar
// /api/auth/login-guard e chamar a API do Supabase Auth direto.
// Aqui os dois passos acontecem na mesma rota, então quem passa
// pelo nosso login não tem como pular a checagem.
//
// AVISO IMPORTANTE (não é código, é configuração): a anon key do
// Supabase é pública por definição — nada impede alguém de chamar
// a API do Supabase Auth diretamente (fora da nossa aplicação) com
// essa key. Este rate limit protege quem usa o nosso site/app, mas
// a defesa completa contra força bruta/credential stuffing exige
// TAMBÉM configurar em Supabase Dashboard > Authentication > Rate
// Limits, e idealmente activar CAPTCHA (hCaptcha/Turnstile) em
// Authentication > Settings — isso bloqueia mesmo pedidos feitos
// fora da nossa aplicação.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const { email, phone, password } = await request.json();
  const identificador = (email || phone || '').toString().toLowerCase();

  if (!identificador || !password) {
    return NextResponse.json({ error: 'Dados em falta' }, { status: 400 });
  }

  // 5 tentativas por identificador a cada 10 minutos
  const limitado = await rateLimit(`login:${identificador}`, 5, 10 * 60);
  if (!limitado.ok) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarda alguns minutos.' }, { status: 429 });
  }

  const supabase = await createClient();
  const { error } = email
    ? await supabase.auth.signInWithPassword({ email, password })
    : await supabase.auth.signInWithPassword({ phone, password });

  if (error) {
    return NextResponse.json({ error: 'Email/telefone ou senha incorretos.' }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
