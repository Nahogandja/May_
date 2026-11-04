'use strict';

const pool = require('../config/db');
const { cents } = require('../services/wallet');

// GET /api/admin/payments
// Read-only audit view of real PostgreSQL records holding SIMULATED ES4WAC Wallet funds.
// A ride is paid when a ride_payment debit exists; completion is a separate ride state.
const listPayments = async (_req, res) => {
  try {
    // Lifetime totals, deliberately NOT limited to the 500 most recent rows.
    const [summaryResult, paymentsResult] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::INTEGER AS paid_ride_count,
          COUNT(*) FILTER (WHERE r.status = 'Completed')::INTEGER AS completed_paid_ride_count,
          COALESCE(SUM(-t.amount_cents), 0)::BIGINT AS gross_paid_cents,
          (SELECT COALESCE(SUM(amount_cents), 0)::BIGINT
             FROM wallet_transactions WHERE entry_type = 'ride_refund') AS refunded_cents,
          (SELECT COALESCE(SUM(amount_cents), 0)::BIGINT
             FROM wallet_transactions WHERE entry_type = 'driver_earning') AS driver_credited_cents
        FROM wallet_transactions t
        JOIN rides r ON r.id = t.ride_id
        WHERE t.entry_type = 'ride_payment'
      `),
      pool.query(`
        SELECT
          p.id AS payment_id,
          p.ride_id,
          p.created_at AS paid_at,
          -p.amount_cents AS paid_cents,
          COALESCE(ref.refunded_cents, 0)::BIGINT AS refunded_cents,
          (-p.amount_cents - COALESCE(ref.refunded_cents, 0))::BIGINT AS net_cents,
          ref.refunded_at,
          COALESCE(earned.credited_cents, 0)::BIGINT AS driver_credited_cents,
          r.status AS ride_status,
          r.booking_mode,
          r.pickup,
          r.dropoff,
          r.created_at AS ride_created_at,
          passenger.name AS passenger_name,
          passenger.email AS passenger_email,
          driver.name AS driver_name
        FROM wallet_transactions p
        JOIN rides r ON r.id = p.ride_id
        JOIN users passenger ON passenger.id = p.user_id
        LEFT JOIN users driver ON driver.id = r.driver_id
        LEFT JOIN LATERAL (
          SELECT SUM(t.amount_cents)::BIGINT AS refunded_cents,
                 MAX(t.created_at) AS refunded_at
          FROM wallet_transactions t
          WHERE t.ride_id = p.ride_id
            AND t.user_id = p.user_id
            AND t.entry_type = 'ride_refund'
        ) ref ON TRUE
        LEFT JOIN LATERAL (
          SELECT SUM(t.amount_cents)::BIGINT AS credited_cents
          FROM wallet_transactions t
          WHERE t.ride_id = p.ride_id
            AND t.user_id = r.driver_id
            AND t.entry_type = 'driver_earning'
        ) earned ON TRUE
        WHERE p.entry_type = 'ride_payment'
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT 500
      `),
    ]);

    const totals = summaryResult.rows[0];
    const grossPaidCents = cents(totals.gross_paid_cents);
    const refundedCents = cents(totals.refunded_cents);

    return res.json({
      demo: true,
      currency: 'NAD',
      note: 'Academic demo: these are simulated ES4WAC Wallet transactions, not actual bank or MoMo settlements.',
      summary: {
        paidRideCount: Number(totals.paid_ride_count),
        completedPaidRideCount: Number(totals.completed_paid_ride_count),
        grossPaidCents,
        refundedCents,
        netPaidCents: grossPaidCents - refundedCents,
        driverCreditedCents: cents(totals.driver_credited_cents),
      },
      records: paymentsResult.rows.map((r) => {
        const paidCents = cents(r.paid_cents);
        const refunded = cents(r.refunded_cents);
        return {
          paymentId: r.payment_id,
          rideId: r.ride_id,
          paidAt: r.paid_at,
          refundedAt: r.refunded_at,
          paidCents,
          refundedCents: refunded,
          netCents: cents(r.net_cents),
          driverCreditedCents: cents(r.driver_credited_cents),
          paymentStatus: refunded >= paidCents ? 'Refunded' : refunded > 0 ? 'Partially refunded' : 'Paid',
          paymentMethod: 'ES4WAC Wallet (Demo)',
          rideStatus: r.ride_status,
          bookingMode: r.booking_mode,
          pickup: r.pickup,
          dropoff: r.dropoff,
          passengerName: r.passenger_name,
          passengerEmail: r.passenger_email,
          driverName: r.driver_name,
        };
      }),
      showingLimit: 500,
    });
  } catch (err) {
    console.error('Admin payment records error:', err);
    return res.status(500).json({ message: 'Could not load payment records' });
  }
};

module.exports = { listPayments };
