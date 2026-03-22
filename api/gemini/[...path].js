export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // SDK가 customHeaders로 보낸 이메일 추출 및 검증
  const userEmail = req.headers['x-user-email'];
  const allowedEmails = (process.env.ALLOWED_EMAILS || '').split(',');
  if (!userEmail || !allowedEmails.includes(userEmail.trim())) {
    return res.status(403).json({ error: "Gemini 접근 권한이 없습니다." });
  }

  // SDK가 보낸 경로 조립 및 API Key 몰래 주입
  const targetPath = '/' + (req.query.path || []).join('/');
  const fetchUrl = `https://generativelanguage.googleapis.com${targetPath}?key=${process.env.GEMINI_API_KEY}`;

  try {
    const response = await fetch(fetchUrl, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
    });
    
    // 스트리밍/일반 텍스트 관계없이 ArrayBuffer로 파이프 전송 (타임아웃 우회)
    const arrayBuffer = await response.arrayBuffer();
    res.status(response.status).send(Buffer.from(arrayBuffer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}