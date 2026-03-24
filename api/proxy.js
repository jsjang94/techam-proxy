export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-email');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { userEmail, target, endpoint, body, method } = req.body;
  const actualMethod = (method || req.method || 'GET').toUpperCase();

  // 1. 화이트리스트 검증
  const allowedEmails = (process.env.ALLOWED_EMAILS || '').split(',');
  if (!userEmail || !allowedEmails.includes(userEmail.trim())) {
    return res.status(403).json({ error: "접근 권한이 없습니다." });
  }

  try {
    // ==========================================
    // 🌟 역할 1: 사내망(Jira/Confluence)을 위한 토큰 발급기
    // ==========================================
    if (target === 'atlassian-token') {
      const auth = Buffer.from(`${process.env.ATLASSIAN_ADMIN_EMAIL}:${process.env.ATLASSIAN_TOKEN}`).toString('base64');
      const base = (process.env.ATLASSIAN_BASE_URL || '').replace(/\/$/, '');
      
      return res.status(200).json({ 
        authHeader: `Basic ${auth}`, 
        baseUrl: base 
      });
    }

    // ==========================================
    // 🌟 역할 2: 외부망(Zendesk) 프록시 중계
    // ==========================================
    if (target === 'zendesk') {
      const auth = Buffer.from(`${process.env.ZENDESK_ADMIN_EMAIL}/token:${process.env.ZENDESK_TOKEN}`).toString('base64');
      const fetchUrl = `https://${process.env.ZENDESK_SUBDOMAIN}.zendesk.com${endpoint}`;
      
      let fetchOptions = {
        method: actualMethod,
        headers: { 
          'Content-Type': 'application/json', 
          'Accept': 'application/json',
          'Authorization': `Basic ${auth}`
        },
      };

      if (body && !['GET', 'HEAD'].includes(actualMethod)) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(fetchUrl, fetchOptions);
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("application/json")) {
        let data = await response.json();

        // Zendesk는 여전히 외부망이므로 프록시에서 링크를 보정해서 내려줍니다.
        if (data.results) {
          const zendeskSub = process.env.ZENDESK_SUBDOMAIN;
          data.results = data.results.map(t => ({
            ...t,
            ticketLink: `https://${zendeskSub}.zendesk.com/agent/tickets/${t.id}`
          }));
        }

        if (!response.ok) return res.status(response.status).json({ error: data });
        return res.status(200).json(data);
      } else {
        const textData = await response.text();
        return res.status(response.status).send(textData);
      }
    }

    // 명시되지 않은 target이 들어올 경우 방어
    return res.status(400).json({ error: "잘못된 target 요청입니다." });

  } catch (err) {
    return res.status(500).json({ error: `Proxy Server Error: ${err.message}` });
  }
}