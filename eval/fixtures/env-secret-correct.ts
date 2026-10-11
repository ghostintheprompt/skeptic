import Stripe from "stripe";

const apiKey = process.env.STRIPE_SECRET_KEY;
if (!apiKey) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

const stripe = new Stripe(apiKey, { apiVersion: "2024-04-10" });

export async function chargeCustomer(customerId: string, amountCents: number, idempotencyKey: string) {
  // Stripe's own docs call for an idempotency key on PaymentIntent creation
  // specifically to prevent a network retry or client double-submit from
  // creating a second, separate charge for the same logical request.
  return stripe.paymentIntents.create(
    {
      amount: amountCents,
      currency: "usd",
      customer: customerId,
    },
    { idempotencyKey }
  );
}
