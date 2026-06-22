import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user_id, type, title, message, action_url, related_entity_id, related_entity_type } = await req.json();

    if (!user_id || !type || !title || !message) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const notification = await base44.entities.Notification.create({
      user_id,
      type,
      title,
      message,
      is_read: false,
      action_url: action_url || null,
      related_entity_id: related_entity_id || null,
      related_entity_type: related_entity_type || null,
      created_date: new Date().toISOString()
    });

    return Response.json({ 
      success: true, 
      notification_id: notification.id
    });
  } catch (error) {
    console.error('Create notification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});