
import { useEffect, useMemo, useState } from "react";
import {
  PiggyBank, ShieldCheck, ShoppingBag, TrendingUp,
  Save, LoaderCircle, AlertCircle, CheckCircle2,
  ChevronLeft, ChevronRight, ArrowLeftRight,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import "./UltraSaver.css";

const ALLOCATION = {
  needs: 0.5,
  wants: 0.15,
  savings: 0.35,
};

const NEEDS = new Set([
  "Bills", "Transportation", "Health", "Education",
  "Groceries", "Housing", "Utilities", "Insurance",
]);

const WANTS = new Set([
  "Food & Drink", "Shopping", "Entertainment",
  "Dining Out", "Subscriptions",
]);

const money = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value) || 0);

function monthKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
  ].join("-");
}

function moveMonth(key, amount) {
  const [year, month] = key.split("-").map(Number);
  return monthKey(new Date(year, month - 1 + amount, 1));
}

function classify(category) {
  if (NEEDS.has(category)) return "needs";
  if (WANTS.has(category)) return "wants";
  return "uncategorized";
}

function ProgressCard({
  title, subtitle, Icon, percentage,
  target, actual, color, savings = false,
}) {
  const remaining = target - actual;
  const progress = target > 0
    ? Math.max(0, (actual / target) * 100)
    : actual > 0 ? 100 : 0;

  return (
    <div className="ultra-progress-card">
      <div className="ultra-progress-heading">
        <div className="ultra-progress-icon" style={{ color }}>
          <Icon size={21} />
        </div>
        <div className="ultra-progress-percentage">
          {percentage}%
        </div>
      </div>

      <h3>{title}</h3>
      <p>{subtitle}</p>

      <div className="ultra-progress-amount">
        {money(actual)}
        <span> / {money(target)}</span>
      </div>

      <div className="ultra-progress-track">
        <div className="ultra-progress-fill" style={{
          width: `${Math.min(progress, 100)}%`,
          background: color,
        }} />
      </div>

      <div className="ultra-progress-footer">
        <span>
          {savings
            ? remaining > 0
              ? "Still to save"
              : "Goal reached"
            : remaining >= 0
            ? "Remaining"
            : "Over budget"}
        </span>
        <strong>{money(Math.abs(remaining))}</strong>
      </div>
    </div>
  );
}

export default function UltraSaver({
  userId,
  transactions = [],
  accounts = [],
}) {
  const [income, setIncome] = useState("");
  const [savedIncome, setSavedIncome] = useState(0);
  const [month, setMonth] = useState(monthKey(new Date()));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let active = true;

    async function loadSettings() {
      setLoading(true);
      setMessage(null);

      const { data, error } = await supabase
        .from("budget_settings")
        .select("monthly_income")
        .eq("user_id", userId)
        .maybeSingle();

      if (!active) return;

      if (error) {
        setMessage({ type: "error", text: error.message });
      } else {
        const value = Number(data?.monthly_income || 0);
        setSavedIncome(value);
        setIncome(String(value));
      }

      setLoading(false);
    }

    loadSettings();

    return () => { active = false; };
  }, [userId]);

  async function saveIncome(event) {
    event.preventDefault();

    const value = Number(income);
    if (
      !/^\d+(\.\d{1,2})?$/.test(income) ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      setMessage({
        type: "error",
        text: "Enter a valid monthly take-home income.",
      });
      return;
    }

    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from("budget_settings")
      .upsert({
        user_id: userId,
        monthly_income: value,
        mode: "ultra",
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setSavedIncome(value);
      setMessage({
        type: "success",
        text: "Ultra Saver budget saved.",
      });
    }

    setSaving(false);
  }

  const totals = useMemo(() => {
    const result = {
      needs: 0,
      wants: 0,
      uncategorized: 0,
      income: 0,
      savingsNet: 0,
      savingsDeposits: 0,
      savingsWithdrawals: 0,
      transfersIntoSavings: 0,
      transfersOutOfSavings: 0,
    };

    const savingsIds = new Set(
      accounts
        .filter((account) => account.type === "savings")
        .map((account) => account.id)
    );

    for (const transaction of transactions) {
      if (
        !transaction.transaction_date ||
        !transaction.transaction_date.startsWith(month)
      ) continue;

      const amount = Number(transaction.amount) || 0;
      const type = transaction.type;
      const fromSavings = savingsIds.has(
        transaction.from_account_id
      );
      const toSavings = savingsIds.has(
        transaction.to_account_id
      );

      if (type === "income") {
        result.income += amount;

        if (toSavings) {
          result.savingsNet += amount;
          result.savingsDeposits += amount;
        }
      }

      if (type === "expense") {
        result[classify(transaction.category)] += amount;

        if (fromSavings) {
          result.savingsNet -= amount;
          result.savingsWithdrawals += amount;
        }
      }

      if (type === "transfer") {
        // Savings-to-savings transfers do not create
        // new savings contributions.
        if (!fromSavings && toSavings) {
          result.savingsNet += amount;
          result.savingsDeposits += amount;
          result.transfersIntoSavings += amount;
        }

        if (fromSavings && !toSavings) {
          result.savingsNet -= amount;
          result.savingsWithdrawals += amount;
          result.transfersOutOfSavings += amount;
        }
      }

      if (type === "card_payment" && fromSavings) {
        result.savingsNet -= amount;
        result.savingsWithdrawals += amount;
      }

      // Credit card payments are not counted as
      // new expenses. Their purchases were already
      // counted when recorded as expenses.
    }

    return result;
  }, [transactions, accounts, month]);

  const targets = {
    needs: savedIncome * ALLOCATION.needs,
    wants: savedIncome * ALLOCATION.wants,
    savings: savedIncome * ALLOCATION.savings,
  };

  const totalSpent =
    totals.needs + totals.wants + totals.uncategorized;

  const savingsGoalRemaining =
    targets.savings - totals.savingsNet;

  const monthLabel = new Date(
    `${month}-01T12:00:00`
  ).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const savingsAccountCount = accounts.filter(
    (account) => account.type === "savings"
  ).length;

  if (loading) {
    return (
      <div className="ultra-loading">
        <LoaderCircle className="spin" size={24} />
        Loading your budget...
      </div>
    );
  }

  return (
    <div className="ultra-page">
      <div className="ultra-hero">
        <div className="ultra-hero-content">
          <div className="ultra-kicker">
            <ShieldCheck size={15} />
            ULTRA SAVER MODE
          </div>

          <h2>Save aggressively. Spend intentionally.</h2>
          <p>
            Cover your essentials, keep discretionary spending
            under control, and put 35% of your income toward
            your future.
          </p>

          <div className="ultra-allocation">
            <div style={{
              width: "50%", background: "#7892bc",
            }} />
            <div style={{
              width: "15%", background: "#d5a46a",
            }} />
            <div style={{
              width: "35%", background: "#49a68b",
            }} />
          </div>

          <div className="ultra-allocation-labels">
            <span>50% Needs</span>
            <span>15% Wants</span>
            <span>35% Savings</span>
          </div>
        </div>

        <div className="ultra-hero-symbol">
          <PiggyBank size={65} strokeWidth={1.3} />
        </div>
      </div>

      <div className="ultra-settings">
        <div>
          <h3>Monthly take-home income</h3>
          <p>
            Set your planned income after taxes.
          </p>
        </div>

        <form className="ultra-income-form" onSubmit={saveIncome}>
          <div className="ultra-income-input">
            <span>$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              placeholder="3000.00"
              required
            />
          </div>

          <button className="primary-button"
            type="submit" disabled={saving}>
            {saving
              ? <LoaderCircle size={17} className="spin" />
              : <><Save size={17} /> Save</>}
          </button>
        </form>
      </div>

      {message && (
        <div className={`notice ${message.type}`}>
          {message.type === "error"
            ? <AlertCircle size={17} />
            : <CheckCircle2 size={17} />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="ultra-month-header">
        <div>
          <h2>Monthly breakdown</h2>
          <p>
            Spending and savings calculated from your
            recorded transactions.
          </p>
        </div>

        <div className="ultra-month-switcher">
          <button type="button"
            onClick={() => setMonth(moveMonth(month, -1))}
            aria-label="Previous month">
            <ChevronLeft size={17} />
          </button>

          <strong>{monthLabel}</strong>

          <button type="button"
            onClick={() => setMonth(moveMonth(month, 1))}
            aria-label="Next month">
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      <div className="ultra-progress-grid">
        <ProgressCard
          title="Needs"
          subtitle="Essential living expenses"
          Icon={ShieldCheck}
          percentage={50}
          target={targets.needs}
          actual={totals.needs}
          color="#7892bc"
        />

        <ProgressCard
          title="Wants"
          subtitle="Discretionary spending"
          Icon={ShoppingBag}
          percentage={15}
          target={targets.wants}
          actual={totals.wants}
          color="#d5a46a"
        />

        <ProgressCard
          title="Actual savings"
          subtitle="Net contributions to savings accounts"
          Icon={PiggyBank}
          percentage={35}
          target={targets.savings}
          actual={totals.savingsNet}
          color="#49a68b"
          savings
        />
      </div>

      <div className="ultra-bottom-grid">
        <div className="ultra-detail-card">
          <div className="ultra-detail-heading">
            <TrendingUp size={20} />
            <h3>Spending overview</h3>
          </div>

          <div className="ultra-detail-row">
            <span>Planned monthly income</span>
            <strong>{money(savedIncome)}</strong>
          </div>

          <div className="ultra-detail-row">
            <span>Needs spent</span>
            <strong>{money(totals.needs)}</strong>
          </div>

          <div className="ultra-detail-row">
            <span>Wants spent</span>
            <strong>{money(totals.wants)}</strong>
          </div>

          <div className="ultra-detail-row">
            <span>Uncategorized spending</span>
            <strong>{money(totals.uncategorized)}</strong>
          </div>

          <div className="ultra-detail-row emphasized">
            <span>Planned income less spending</span>
            <strong>{money(savedIncome - totalSpent)}</strong>
          </div>
        </div>

        <div className="ultra-detail-card">
          <div className="ultra-detail-heading">
            <PiggyBank size={20} />
            <h3>Savings progress</h3>
          </div>

          <div className="ultra-savings-number">
            {money(totals.savingsNet)}
          </div>

          <p className="ultra-savings-description">
            Net change from recorded activity in your savings
            accounts this month, excluding opening balances.
          </p>

          <div className="ultra-detail-row">
            <span>Monthly savings goal</span>
            <strong>{money(targets.savings)}</strong>
          </div>

          <div className="ultra-detail-row">
            <span>Money added to savings</span>
            <strong>{money(totals.savingsDeposits)}</strong>
          </div>

          <div className="ultra-detail-row">
            <span>Money taken from savings</span>
            <strong>{money(totals.savingsWithdrawals)}</strong>
          </div>

          <div className="ultra-detail-row emphasized">
            <span>
              {savingsGoalRemaining > 0
                ? "Still needed"
                : "Above savings goal"}
            </span>
            <strong>{money(Math.abs(savingsGoalRemaining))}</strong>
          </div>

          <p className="ultra-disclaimer">
            Savings are calculated from transactions you enter.
            Transfers between two savings accounts are ignored.
            This is not connected to live bank balances.
          </p>
        </div>
      </div>

      {savingsAccountCount === 0 && (
        <div className="notice error">
          <AlertCircle size={17} />
          <span>
            Add an account with type "Savings" to track your
            actual savings progress.
          </span>
        </div>
      )}

      {totals.uncategorized > 0 && (
        <div className="notice error">
          <AlertCircle size={17} />
          <span>
            {money(totals.uncategorized)} of spending uses
            categories outside Needs and Wants. It's included
            in total spending but not assigned to either limit.
          </span>
        </div>
      )}

      <div className="ultra-detail-card">
        <div className="ultra-detail-heading">
          <ArrowLeftRight size={20} />
          <h3>How to build savings</h3>
        </div>

        <p className="ultra-savings-description">
          Open Transactions, choose Transfer, select your
          checking account as the source and your savings
          account as the destination. Save the transaction.
          Your savings progress will update automatically.
        </p>
      </div>
    </div>
  );
}
