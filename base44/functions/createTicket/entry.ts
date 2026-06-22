import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { subject, description, category, priority = 'medium' } = await req.json();

    if (!subject || !description || !category) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const ticket = await base44.entities.Ticket.create({
      user_id: user.id,
      username: user.full_name,
      subject,
      description,
      category,
      priority,
      status: 'open',
      messages: [{
        sender_id: user.id,
        sender_name: user.full_name,
        sender_role: user.role || 'user',
        message: description,
        timestamp: new Date().toISOString()
      }]
    });

    return Response.json({ 
      success: true, 
      message: 'Ticket created successfully',
      ticket_id: ticket.id
    });
  } catch (error) {
    console.error('Create ticket error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});