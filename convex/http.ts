import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { WebhookEvent } from "@clerk/nextjs/server";
import { Webhook } from "svix";
import { api, internal } from "./_generated/api";

const http = httpRouter();


http.route({
  path: "/lemon-squeezy-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const payloadString = await request.text();
    const signature = request.headers.get("X-Signature");

    if (!signature) {
      return new Response("Missing X-Signature header", { status: 400 });
    }

    try {
      const payload = await ctx.runAction(internal.lemonSqueezy.verifyWebhook, {
        payload: payloadString,
        signature,
      });

      if (payload.meta.event_name === "order_created") {
        console.log(payload.meta)
        const { data } = payload;

        const { success } = await ctx.runMutation(api.users.upgradeToPro, {
          email: data.attributes.user_email,
          lemonSqueezyCustomerId: data.attributes.customer_id.toString(),
          lemonSqueezyOrderId: data.id,
          amount: data.attributes.total,
        });

        if (success) {
          // optionally do anything here/
          console.log("payment ho gaya sucessfull")
        }
      }

      return new Response("Webhook processed successfully", { status: 200 });
    } catch (error) {
      console.log("Webhook error:", error);
      return new Response("Error processing webhook", { status: 500 });
    }
  }),
});


http.route({
    path: '/clerk-webhook',
    method: 'POST',

    handler: httpAction(async (ctx, req): Promise<any> => {
        // Handle webhook
        const webhooksecret = process.env.CLERK_WEBHOOK_SECRET;
        if (!webhooksecret) {
            throw new Error("CLERK_WEBHOOK_SECRET not set");
        }

        console.log("CLERK_WEBHOOK_SECRET is set:", !!process.env.CLERK_WEBHOOK_SECRET);


        const svix_id = req.headers.get("svix-id");
        const svix_signature = req.headers.get("svix-signature");
        const svix_timestamp = req.headers.get("svix-timestamp");

        if (!svix_id || !svix_signature || !svix_timestamp) {
            return new Response("Missing headers svix", { status: 400 });
        }

        const payload = await req.json();
        const body = JSON.stringify(payload);

        const wh = new Webhook(webhooksecret);
        let evt: WebhookEvent;

        try {
            evt = wh.verify(body, {
                "svix-id": svix_id,
                "svix-signature": svix_signature,
                "svix-timestamp": svix_timestamp
            }) as WebhookEvent;
        } catch (error) {
            return new Response("Invalid signature", { status: 400 });
        }

        const eventType = evt.type;
        if (eventType === "user.created") {
            // Handle user created event
            const { id, email_addresses, first_name, last_name } = evt.data;

            const email = email_addresses[0]?.email_address;
            const name = `${first_name} ${last_name}`.trim();

            try {
                await ctx.runMutation(api.users.syncUser, { userId: id, email, name });
                return new Response("User created", { status: 200 });
            } catch (error) {
                return new Response("Error while creating user", { status: 500 });
            }
        } else {
            return new Response("Event type not handled, User not created", { status: 500 });
        }
    })
});

export default http;