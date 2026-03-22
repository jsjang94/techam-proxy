export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 1. 일렉트론이 보낸 이메일 검증
  const userEmail = req.headers['x-user-email'];
  const allowedEmails = (process.env.ALLOWED_EMAILS || '').split(',');
  if (!userEmail || !allowedEmails.includes(userEmail.trim())) {
    return res.status(403).json({ error: "Gemini 접근 권한이 없습니다." });
  }

  // 2. 일렉트론이 요청한 원본 주소에서 '/api/gemini'만 싹둑 잘라내고 구글 주소로 교체
  // req.url은 "/api/gemini/v1beta/models/..." 형태로 들어옵니다.
  const targetPath = req.url.replace(/^\/api\/gemini/, '');
  
  // 3. Vercel 환경변수에 있는 진짜 구글 API 키를 몰래 뒤에 붙임
  const fetchUrl = `https://generativelanguage.googleapis.com${targetPath}${targetPath.includes('?') ? '&' : '?'}key=${process.env.GEMINI_API_KEY}`;

  try {
    const response = await fetch(fetchUrl, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
    });
    
    // 4. 구글의 답변(스트리밍 등)을 그대로 일렉트론으로 토스!
    const arrayBuffer = await response.arrayBuffer();
    res.status(response.status).send(Buffer.from(arrayBuffer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}