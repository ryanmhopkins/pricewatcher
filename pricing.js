// PlanSentry B2B pricing migration.
// Paid plans use authenticated Checkout on the PlanSentry Stripe account.
// Never reuse legacy Stripe Payment Links: they belong to the retired Pro offering.
// Growth: $19/month (25 monitors). Business: $49/month (100 monitors).
// The pricing cards send users to account sign-in or creation, then Checkout.
