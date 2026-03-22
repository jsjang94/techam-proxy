export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { userEmail, target, endpoint, body, method } = req.body;
  const actualMethod = (method || req.method || 'GET').toUpperCase();

  const allowedEmails = (process.env.ALLOWED_EMAILS || '').split(',');
  if (!userEmail || !allowedEmails.includes(userEmail.trim())) {
    return res.status(403).json({ error: "접근 권한이 없습니다. 관리자에게 문의하세요." });
  }

  try {
    let fetchUrl = '';
    let fetchOptions = {
      method: actualMethod,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    };
    
    // GET, HEAD에는 body를 싣지 않음 (400 에러 방어)
    if (body && !['GET', 'HEAD'].includes(actualMethod)) {
      fetchOptions.body = JSON.stringify(body);
    }

    if (target === 'atlassian') {
      const auth = Buffer.from(`${process.env.ATLASSIAN_ADMIN_EMAIL}:${process.env.ATLASSIAN_TOKEN}`).toString('base64');
      const base = (process.env.ATLASSIAN_BASE_URL || '').replace(/\/$/, ''); // 끝 슬래시 제거
      const endp = endpoint.startsWith('/') ? endpoint : `/${endpoint}`; // 시작 슬래시 보장
      fetchUrl = `${base}${endp}`;
      fetchOptions.headers['Authorization'] = `Basic ${auth}`;
    } else if (target === 'zendesk') {
      const auth = Buffer.from(`${process.env.ZENDESK_ADMIN_EMAIL}/token:${process.env.ZENDESK_TOKEN}`).toString('base64');
      fetchUrl = `https://${process.env.ZENDESK_SUBDOMAIN}.zendesk.com${endpoint}`;
      fetchOptions.headers['Authorization'] = `Basic ${auth}`;
    } else {
      return res.status(400).json({ error: "지원하지 않는 타겟입니다." });
    }

    const response = await fetch(fetchUrl, fetchOptions);
    const contentType = response.headers.get("content-type") || "";
    
    if (contentType.includes("application/json")) {
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data });
      return res.status(200).json(data);
    } else {
      const textData = await response.text();
      if (!response.ok) return res.status(response.status).json({ error: textData });
      return res.status(200).send(textData);
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}