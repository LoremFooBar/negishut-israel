import fetch from 'node-fetch'

const baseUrl = 'https://graph.facebook.com/v18.0/198430363345391/messages'

const whatsappApi = {
  sendStatusUpdate: async function(name: string, status: string, phone: string) {
    await this.sendTemplate(phone, 'task_updates', name, status)
  },

  sendTemplate: async function(phone: string, templateName: string, ...params: string[]) {
    const accessToken = process.env['WHATSAPP_ACCESS_TOKEN']
    const skipActualApi = process.env['DISABLE_WHATSAPP_API'] === 'true'

    if (skipActualApi) {
      console.debug('skipped sending whatsapp template', { phone, templateName, params })
      return
    }

    let response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'template',
        template: {
          name: 'task_updates',
          language: { code: 'he' },
          components: [{
            type: 'body',
            parameters: params.map(p => ({ type: 'text', text: p }))
          }]
        }
      })
    })

    console.log({ ok: response.ok, json: await response.json() })
  }
}

export default whatsappApi
