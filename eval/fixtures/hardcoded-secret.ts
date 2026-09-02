import Stripe from "stripe";

// TODO: move to env before launch
const stripe = new Stripe("sk_live_FIXTURE_51NcQ2xJ3kH9pT2vLmR8fGz7YbXqA4wS6dE0_NOT_REAL", {
  apiVersion: "2024-04-10",
});

export async function chargeCustomer(customerId: string, amountCents: number) {
  return stripe.paymentIntents.create({
    amount: amountCents,
    currency: "usd",
    customer: customerId,
  });
}
