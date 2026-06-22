import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { recipient_id, recipient_name, subject, content } = await req.json();

    if (!recipient_id || !content) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const message = await base44.entities.Message.create({
      sender_id: user.id,
      sender_name: user.full_name,
      recipient_id,
      recipient_name: recipient_name || 'User',
      subject: subject || '',
      content,
      is_read: false,
      created_date: new Date().toISOString()
    });

    // Create notification for the recipient
    await base44.entities.Notification.create({
      user_id: recipient_id,
      type: 'system',
      title: 'New Message',
      message: `${user.full_name} sent you a message`,
      is_read: false,
      related_entity_id: message.id,
      related_entity_type: 'Message',
      created_date: new Date().toISOString()
    });

    return Response.json({ 
      success: true, 
      message: 'Message sent successfully',
      message_id: message.id
    });
  } catch (error) {
    console.error('Send message error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});