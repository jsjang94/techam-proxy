export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-email');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { userEmail, target, endpoint, body, method } = req.body;
  const actualMethod = (method || req.method || 'GET').toUpperCase();

  // 1. 화이트리스트 검증 (서버에서만 수행)
  const allowedEmails = (process.env.ALLOWED_EMAILS || '').split(',');
  if (!userEmail || !allowedEmails.includes(userEmail.trim())) {
    return res.status(403).json({ error: "접근 권한이 없습니다." });
  }

  try {
    let fetchUrl = '';
    let fetchOptions = {
      method: actualMethod,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    };

    // GET 요청 시 Body 제거 (Atlassian 400 에러 방지)
    if (body && !['GET', 'HEAD'].includes(actualMethod)) {
      fetchOptions.body = JSON.stringify(body);
    }

    // 2. 타겟별 인증 정보 주입
    if (target === 'atlassian') {
      const auth = Buffer.from(`${process.env.ATLASSIAN_ADMIN_EMAIL}:${process.env.ATLASSIAN_TOKEN}`).toString('base64');
      const base = (process.env.ATLASSIAN_BASE_URL || '').replace(/\/$/, '');
      const endp = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      
      fetchUrl = `${base}${endp}`;
      fetchOptions.headers['Authorization'] = `Basic ${auth}`;
    } 
    else if (target === 'zendesk') {
      const auth = Buffer.from(`${process.env.ZENDESK_ADMIN_EMAIL}/token:${process.env.ZENDESK_TOKEN}`).toString('base64');
      fetchUrl = `https://${process.env.ZENDESK_SUBDOMAIN}.zendesk.com${endpoint}`;
      fetchOptions.headers['Authorization'] = `Basic ${auth}`;
    }

    const response = await fetch(fetchUrl, fetchOptions);
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      let data = await response.json();

      // 🌟 [핵심 보안 로직] 데이터 응답 직전에 서버가 알고 있는 도메인을 붙여서 내려줌
      // 일렉트론 메모리에는 도메인이 남지 않고, 오직 '완성된 링크'만 전달됩니다.
      const atlassianBase = (process.env.ATLASSIAN_BASE_URL || '').replace(/\/$/, '');
      const zendeskSub = process.env.ZENDESK_SUBDOMAIN;

      if (target === 'atlassian') {
        // Jira 이슈 링크 보정
        if (data.issues) {
          data.issues = data.issues.map(i => ({
            ...i,
            issueLink: `${atlassianBase}/browse/${i.key}` 
          }));
        }
        // Confluence 검색 결과 링크 보정
        if (data.results) {
          data.results = data.results.map(r => ({
            ...r,
            contentLink: `${atlassianBase}/wiki${r._links?.webui || ''}`
          }));
        }
      } 
      else if (target === 'zendesk' && data.results) {
        // Zendesk 티켓 링크 보정
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
  } catch (err) {
    return res.status(500).json({ error: `Proxy Server Error: ${err.message}` });
  }
}