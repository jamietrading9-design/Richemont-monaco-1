const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY; // Service Role Key benötigt

exports.handler = async (event, context) => {
  const fileName = event.queryStringParameters.file || (event.body ? JSON.parse(event.body).fileName : null);
  if (!fileName) {
    return { statusCode: 400, body: JSON.stringify({ error: "Keine Datei angegeben" }) };
  }

  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'GET') {
    try {
      const settingsRes = await fetch(`${SUPABASE_URL}/rest/v1/site_settings?id=eq.main&select=*`, { headers });
      const settings = await settingsRes.json();
      
      // Produkte laden
      const productsRes = await fetch(`${SUPABASE_URL}/rest/v1/products?select=*`, { headers });
      const products = await productsRes.json();

      const combinedData = {
        siteTitle: settings[0]?.siteTitle || "Richemont Monaco",
        siteSubtitle: settings[0]?.siteSubtitle || "Designer Clothing",
        products: products || []
      };
      
      return { 
        statusCode: 200, 
        body: JSON.stringify({ content: JSON.stringify(combinedData) }) 
      };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const { content } = JSON.parse(event.body); 
      const data = JSON.parse(content);

      // 1. Einstellungen aktualisieren
      await fetch(`${SUPABASE_URL}/rest/v1/site_settings?id=eq.main`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          siteTitle: data.siteTitle,
          siteSubtitle: data.siteSubtitle
        })
      });

      // 2. Produkte synchronisieren (Einfachheitshalber: Löschen und Neu einfügen)
      // In einer Produktionsumgebung wäre ein Upsert sauberer.
      await fetch(`${SUPABASE_URL}/rest/v1/products?slug=not.is.null`, {
        method: 'DELETE',
        headers: { ...headers, 'Prefer': 'count=exact' }
      });

      if (data.products && data.products.length > 0) {
        const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify(data.products)
        });

        if (!insertRes.ok) throw new Error("Fehler beim Speichern der Produkte");
      }
      
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, body: "Method Not Allowed" };
};