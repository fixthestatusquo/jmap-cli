export function formatAndDisplayMessages(messages, jsonOutput) {
  if (jsonOutput) {
    const cleanedMessages = messages.map(message => {
      const cleanedMessage = {};
      for (const key in message) {
        const value = message[key];
        if (value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)) {
          if (key.startsWith('header:')) {
            if (key === 'header:X-Priority:asText') cleanedMessage['X-Priority'] = value;
            else if (key === 'header:Importance:asText') cleanedMessage['Importance'] = value;
            else if (key === 'header:Priority:asText') cleanedMessage['Priority'] = value;
            else if (key === 'header:Auto-Submitted:asText') cleanedMessage['Auto-Submitted'] = value;
          } else {
            cleanedMessage[key] = value;
          }
        }
      }
      return cleanedMessage;
    });
    console.log(JSON.stringify(cleanedMessages, null, 2));
  } else {
    messages.forEach(message => {
      const display = (label, value) => {
        if (value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)) {
          console.log(`${label}: ${value}`);
        }
      };

      display('ID', message.id);
      display('Subject', message.subject);
      display('From', message.from ? message.from.map(f => f.name ? `${f.name} <${f.email}>` : f.email).join(', ') : null);
      display('To', message.to ? message.to.map(t => t.name ? `${t.name} <${t.email}>` : t.email).join(', ') : null);
      display('Cc', message.cc ? message.cc.map(c => c.name ? `${c.name} <${c.email}>` : c.email).join(', ') : null);
      display('Bcc', message.bcc ? message.bcc.map(b => b.name ? `${b.name} <${b.email}>` : b.email).join(', ') : null);
      display('Received', message.receivedAt);
      display('Size', message.size);
      if (message.hasAttachment) display('Has Attachment', message.hasAttachment);
      if (Object.keys(message.keywords).length > 0) display('Keywords', JSON.stringify(message.keywords));
      display('Preview', message.preview);
      display('X-Priority', message['header:X-Priority:asText']);
      display('Importance', message['header:Importance:asText']);
      display('Priority', message['header:Priority:asText']);
      display('Auto-Submitted', message['header:Auto-Submitted:asText']);
      console.log('---');
    });
  }
}
