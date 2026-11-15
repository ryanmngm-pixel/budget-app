
import { useEffect, useState } from "react";
import {
  Wallet, LayoutDashboard, CreditCard, Landmark, Banknote,
  PiggyBank, Plus, ArrowRight, LogOut, LoaderCircle,
  Eye, EyeOff, Mail, LockKeyhole, AlertCircle,
  CheckCircle2, X, TrendingUp, ShieldCheck, RefreshCw,
  ArrowDownLeft, ArrowUpRight, ReceiptText, Target,
  ArrowLeftRight, Pencil, Trash2,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import UltraSaver from "./components/UltraSaver";
import "./App.css";

const money = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value) || 0);

const today = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};

const accountTypes = [
  { value: "checking", label: "Checking", Icon: Landmark },
  { value: "savings", label: "Savings", Icon: PiggyBank },
  { value: "cash", label: "Cash", Icon: Banknote },
  { value: "credit", label: "Credit Card", Icon: CreditCard },
];

const transactionTypes = [
  { value: "income", label: "Add money", Icon: ArrowDownLeft },
  { value: "expense", label: "Expense / debt", Icon: ArrowUpRight },
  { value: "transfer", label: "Transfer", Icon: ArrowLeftRight },
  { value: "card_payment", label: "Pay card", Icon: CreditCard },
];

const categories = [
  "Income", "Groceries", "Housing", "Utilities",
  "Insurance", "Transportation", "Health", "Education",
  "Bills", "Food & Drink", "Shopping", "Entertainment",
  "Dining Out", "Subscriptions", "Other",
];

const blankTransaction = () => ({
  type: "expense",
  amount: "",
  from_account_id: "",
  to_account_id: "",
  category: "Other",
  merchant: "",
  note: "",
  transaction_date: today(),
});

const blankAccount = () => ({
  name: "",
  type: "checking",
  opening_balance: "",
  credit_limit: "",
});

const validAmount = (value, allowZero = false) => {
  const str = String(value);
  const number = Number(str);
  return (
    /^\d+(\.\d{1,2})?$/.test(str) &&
    Number.isFinite(number) &&
    (allowZero ? number >= 0 : number > 0)
  );
};

function Brand() {
  return (
    <div className="brand">
      <div className="brand-icon">
        <Wallet size={21} />
      </div>
      <span>budget.</span>
    </div>
  );
}

function Notice({ type = "error", children }) {
  return (
    <div className={`notice ${type}`}>
      {type === "error"
        ? <AlertCircle size={17} />
        : <CheckCircle2 size={17} />}
      <span>{children}</span>
    </div>
  );
}

function SummaryCard({ label, value, Icon, detail, featured }) {
  return (
    <div className={`summary-card ${featured ? "featured" : ""}`}>
      <div className="summary-top">
        <span>{label}</span>
        <div className="summary-icon"><Icon size={19} /></div>
      </div>
      <div className="summary-value">{value}</div>
      <div className="summary-detail">{detail}</div>
    </div>
  );
}

function AccountCard({ account, onAction }) {
  const type = accountTypes.find((x) => x.value === account.type);
  const Icon = type?.Icon || Wallet;
  const credit = account.type === "credit";

  return (
    <div className="account-card">
      <div className="account-card-top">
        <div className="account-icon"><Icon size={21} /></div>
        <span className="account-type">
          {credit ? "CREDIT CARD" : account.type.toUpperCase()}
        </span>
      </div>
      <h3>{account.name}</h3>
      <div className="account-balance-label">
        {credit ? "Outstanding balance" : "Available balance"}
      </div>
      <div className="account-balance">{money(account.balance)}</div>
      <div className="account-card-footer">
        {credit ? (
          <>
            <span>Credit limit</span>
            <strong>{money(account.credit_limit)}</strong>
          </>
        ) : (
          <>
            <span>Account status</span>
            <strong className="status-active">
              <span className="status-dot" /> Tracking
            </strong>
          </>
        )}
      </div>
      <div className="account-actions">
        {credit ? (
          <>
            <button onClick={() => onAction("expense", account.id)}>
              <Plus size={15} /> Add debt
            </button>
            <button onClick={() => onAction("card_payment", account.id)}>
              <CreditCard size={15} /> Pay card
            </button>
          </>
        ) : (
          <>
            <button onClick={() => onAction("income", account.id)}>
              <Plus size={15} /> Add money
            </button>
            <button onClick={() => onAction("transfer", account.id)}>
              <ArrowLeftRight size={15} /> Transfer
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [initializing, setInitializing] = useState(true);

  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState(null);

  const [page, setPage] = useState("dashboard");
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");

  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountForm, setAccountForm] = useState(blankAccount);

  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [transactionForm, setTransactionForm] = useState(blankTransaction);
  const [editingId, setEditingId] = useState(null);
  const [deletingTransaction, setDeletingTransaction] = useState(null);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const userId = session?.user?.id;

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setAuthMessage({ type: "error", text: error.message });
      setSession(data?.session ?? null);
      setInitializing(false);
    });

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, next) => {
        if (!mounted) return;
        setSession(next);
        setInitializing(false);
      });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setAccounts([]);
      setTransactions([]);
      setDataLoading(false);
      return;
    }

    let active = true;

    async function load() {
      setDataLoading(true);
      const [a, t] = await Promise.all([
        supabase.from("account_balances").select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
        supabase.from("transactions").select("*")
          .eq("user_id", userId)
          .order("transaction_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

      if (!active) return;
      if (a.error || t.error) {
        setDataError((a.error || t.error).message);
      } else {
        setAccounts(a.data || []);
        setTransactions(t.data || []);
        setDataError("");
      }
      setDataLoading(false);
    }

    load();
    return () => { active = false; };
  }, [userId]);

  async function refreshData() {
    if (!userId) return false;

    setDataLoading(true);
    const [a, t] = await Promise.all([
      supabase.from("account_balances").select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      supabase.from("transactions").select("*")
        .eq("user_id", userId)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    const error = a.error || t.error;
    if (error) {
      setDataError(error.message);
    } else {
      setAccounts(a.data || []);
      setTransactions(t.data || []);
      setDataError("");
    }
    setDataLoading(false);
    return !error;
  }

  async function handleAuth(event) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthMessage(null);

    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail) throw new Error("Enter your email.");

      if (authMode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(
          cleanEmail,
          { redirectTo: window.location.origin }
        );
        if (error) throw error;
        setAuthMessage({
          type: "success",
          text: "If that account exists, a reset email will be sent.",
        });
      } else if (authMode === "signup") {
        if (password.length < 8) {
          throw new Error("Use at least 8 characters.");
        }
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.session) setSession(data.session);
        else setAuthMessage({
          type: "success",
          text: "Check your email to confirm your account.",
        });
      } else {
        const { data, error } =
          await supabase.auth.signInWithPassword({
            email: cleanEmail, password,
          });
        if (error) throw error;
        setSession(data.session);
      }
      setPassword("");
    } catch (error) {
      setAuthMessage({ type: "error", text: error.message });
    } finally {
      setAuthLoading(false);
    }
  }

  function changeAuthMode(mode) {
    setAuthMode(mode);
    setAuthMessage(null);
    setPassword("");
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) setDataError(error.message);
    else {
      setSession(null);
      setPage("dashboard");
    }
  }

  const cashAccounts = accounts.filter((a) => a.type !== "credit");
  const creditAccounts = accounts.filter((a) => a.type === "credit");

  const totalCash = cashAccounts.reduce(
    (sum, a) => sum + Number(a.balance || 0), 0
  );
  const totalDebt = creditAccounts.reduce(
    (sum, a) => sum + Number(a.balance || 0), 0
  );
  const totalCreditLimit = creditAccounts.reduce(
    (sum, a) => sum + Number(a.credit_limit || 0), 0
  );
  const netWorth = totalCash - totalDebt;
  const availableCredit = totalCreditLimit - totalDebt;
  const creditUtilization = totalCreditLimit > 0
    ? (totalDebt / totalCreditLimit) * 100 : 0;

  const accountById = (id) => accounts.find((a) => a.id === id);
  const accountName = (id) => accountById(id)?.name || "Unknown account";

  function openAccountModal() {
    setAccountForm(blankAccount());
    setFormError("");
    setAccountModalOpen(true);
  }

  async function createAccount(event) {
    event.preventDefault();
    if (saving) return;

    if (!accountForm.name.trim()) {
      setFormError("Enter an account name.");
      return;
    }
    if (!validAmount(accountForm.opening_balance || "0", true)) {
      setFormError("Enter a valid opening balance.");
      return;
    }
    if (accountForm.type === "credit" &&
        !validAmount(accountForm.credit_limit || "0", true)) {
      setFormError("Enter a valid credit limit.");
      return;
    }

    setSaving(true);
    setFormError("");

    const { error } = await supabase.from("accounts").insert({
      name: accountForm.name.trim(),
      type: accountForm.type,
      opening_balance: Number(accountForm.opening_balance || 0),
      credit_limit: accountForm.type === "credit"
        ? Number(accountForm.credit_limit || 0) : null,
    });

    if (error) {
      setFormError(error.message);
    } else {
      const refreshed = await refreshData();
      if (refreshed) setAccountModalOpen(false);
      else setFormError("Account saved, but refreshing failed.");
    }
    setSaving(false);
  }

  function openTransactionModal(type = "expense", accountId = "") {
    const form = blankTransaction();
    form.type = type;
    form.category = type === "income" ? "Income" : "Other";

    if (type === "income") form.to_account_id = accountId;
    else if (type === "card_payment") form.to_account_id = accountId;
    else form.from_account_id = accountId;

    setTransactionForm(form);
    setEditingId(null);
    setFormError("");
    setTransactionModalOpen(true);
  }

  function editTransaction(transaction) {
    setTransactionForm({
      type: transaction.type,
      amount: String(transaction.amount),
      from_account_id: transaction.from_account_id || "",
      to_account_id: transaction.to_account_id || "",
      category: transaction.category || "Other",
      merchant: transaction.merchant || "",
      note: transaction.note || "",
      transaction_date: transaction.transaction_date || today(),
    });
    setEditingId(transaction.id);
    setFormError("");
    setTransactionModalOpen(true);
  }

  function updateTransaction(field, value) {
    setTransactionForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function changeTransactionType(type) {
    setTransactionForm((previous) => ({
      ...previous,
      type,
      from_account_id: "",
      to_account_id: "",
      category: type === "income" ? "Income" : "Other",
    }));
    setFormError("");
  }

  function validateTransaction(form) {
    if (!validAmount(form.amount)) {
      return "Enter a valid amount greater than zero.";
    }
    if (!form.transaction_date) return "Choose a date.";

    const from = accountById(form.from_account_id);
    const to = accountById(form.to_account_id);
    const amount = Number(form.amount);

    if (form.type === "income") {
      if (!to || to.type === "credit") {
        return "Select a non-credit destination account.";
      }
    } else if (form.type === "expense") {
      if (!from) return "Select the account used.";
    } else if (form.type === "transfer") {
      if (!from || !to) return "Select both accounts.";
      if (from.id === to.id) {
        return "Choose two different accounts.";
      }
      if (from.type === "credit" || to.type === "credit") {
        return "Transfers must use non-credit accounts.";
      }
    } else if (form.type === "card_payment") {
      if (!from || from.type === "credit") {
        return "Choose a non-credit payment account.";
      }
      if (!to || to.type !== "credit") {
        return "Choose the credit card to pay.";
      }
    } else {
      return "Invalid transaction type.";
    }

    // When editing, undo the original transaction's effect
    // before checking available funds. This is only a UI
    // safeguard, not a database-level overdraft guarantee.
    const original = transactions.find((t) => t.id === editingId);

    function originalImpact(account) {
      if (!original) return 0;
      const a = Number(original.amount);
      let impact = 0;

      if (original.type === "income" &&
          original.to_account_id === account.id) impact += a;

      if (original.type === "expense" &&
          original.from_account_id === account.id) {
        impact += account.type === "credit" ? a : -a;
      }

      if (original.type === "transfer") {
        if (original.to_account_id === account.id) impact += a;
        if (original.from_account_id === account.id) impact -= a;
      }

      if (original.type === "card_payment") {
        if (original.to_account_id === account.id) impact -= a;
        if (original.from_account_id === account.id) impact -= a;
      }

      return impact;
    }

    if (from && from.type !== "credit") {
      const restoredBalance =
        Number(from.balance) - originalImpact(from);

      if (amount > restoredBalance) {
        return "Insufficient funds in the source account.";
      }
    }

    if (form.type === "card_payment") {
      const restoredDebt =
        Number(to.balance) - originalImpact(to);

      if (amount > restoredDebt) {
        return "Payment exceeds the card's outstanding debt.";
      }
    }

    return "";
  }

  async function saveTransaction(event) {
    event.preventDefault();
    if (saving) return;

    const validationError = validateTransaction(transactionForm);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const payload = {
      type: transactionForm.type,
      amount: Number(transactionForm.amount),
      from_account_id: transactionForm.from_account_id || null,
      to_account_id: transactionForm.to_account_id || null,
      category: ["transfer", "card_payment"].includes(transactionForm.type)
        ? null : transactionForm.category,
      merchant: transactionForm.merchant.trim() || null,
      note: transactionForm.note.trim() || null,
      transaction_date: transactionForm.transaction_date,
    };

    setSaving(true);
    setFormError("");

    const query = editingId
      ? supabase.from("transactions")
          .update(payload)
          .eq("id", editingId)
          .eq("user_id", userId)
          .select("id")
      : supabase.from("transactions")
          .insert(payload)
          .select("id");

    const { data, error } = await query;

    if (error) {
      setFormError(error.message);
    } else if (!data?.length) {
      setFormError("No transaction was saved. Please refresh.");
    } else {
      const refreshed = await refreshData();
      if (refreshed) {
        setTransactionModalOpen(false);
        setEditingId(null);
      } else {
        setFormError(
          "Saved, but the balances could not refresh. Check history before retrying."
        );
      }
    }

    setSaving(false);
  }

  async function deleteTransaction() {
    if (!deletingTransaction || saving) return;
    setSaving(true);
    setFormError("");

    const { data, error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", deletingTransaction.id)
      .eq("user_id", userId)
      .select("id");

    if (error) {
      setFormError(error.message);
    } else if (!data?.length) {
      setFormError("Transaction not deleted. Please refresh.");
    } else {
      const refreshed = await refreshData();
      if (refreshed) {
        setDeletingTransaction(null);
        setFormError("");
      } else {
        setFormError(
          "Deleted, but the balances could not refresh. Check history before retrying."
        );
      }
    }
    setSaving(false);
  }

  const pageTitles = {
    dashboard: "Overview",
    accounts: "Your accounts",
    transactions: "Transactions",
    budgets: "Budgets",
  };

  const pageDescriptions = {
    dashboard: "A clear picture of where your money stands.",
    accounts: "Every account, all in one place.",
    transactions: "Every dollar moving in and out.",
    budgets: "Spend intentionally and build real savings.",
  };

  if (initializing) {
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={28} />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="auth-page">
        <header className="auth-header">
          <Brand />
          <span className="header-caption">
            Your money. Your control.
          </span>
        </header>
        <main className="auth-main">
          <div className="auth-card">
            <div className="auth-symbol">
              <LockKeyhole size={23} />
            </div>
            <div className="eyebrow">PERSONAL FINANCE, SIMPLIFIED</div>
            <h1>
              {authMode === "login" ? "Welcome back."
                : authMode === "signup" ? "Get started."
                : "Reset password."}
            </h1>
            <p className="auth-description">
              {authMode === "login"
                ? "Sign in to manage your money."
                : authMode === "signup"
                ? "One place for every account and dollar."
                : "We'll send you a password reset link."}
            </p>
            <form onSubmit={handleAuth}>
              <label className="field-label">Email address</label>
              <div className="auth-input">
                <Mail size={18} />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              {authMode !== "reset" && (
                <>
                  <div className="field-heading">
                    <label className="field-label">Password</label>
                    {authMode === "login" && (
                      <button type="button" className="text-button"
                        onClick={() => changeAuthMode("reset")}>
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="auth-input">
                    <LockKeyhole size={18} />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={authMode === "signup"
                        ? "new-password" : "current-password"}
                      required
                    />
                    <button type="button" className="icon-button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label="Toggle password visibility">
                      {showPassword
                        ? <EyeOff size={18} />
                        : <Eye size={18} />}
                    </button>
                  </div>
                </>
              )}

              {authMessage && (
                <Notice type={authMessage.type}>
                  {authMessage.text}
                </Notice>
              )}
              <button type="submit" className="primary-button full"
                disabled={authLoading}>
                {authLoading
                  ? <LoaderCircle className="spin" size={19} />
                  : <>
                      {authMode === "login" ? "Sign in"
                        : authMode === "signup" ? "Create account"
                        : "Send reset link"}
                      <ArrowRight size={18} />
                    </>}
              </button>
            </form>
            <div className="auth-footer">
              {authMode === "login"
                ? "Don't have an account?"
                : "Already have an account?"}
              <button type="button"
                onClick={() => changeAuthMode(
                  authMode === "login" ? "signup" : "login"
                )}>
                {authMode === "login" ? "Create one" : "Sign in"}
              </button>
            </div>
          </div>
          <div className="auth-bottom-note">
            <ShieldCheck size={15} />
            Secure authentication powered by Supabase
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-top">
          <Brand />
          <div className="sidebar-section-label">WORKSPACE</div>
          <nav className="sidebar-nav">
            {[
              ["dashboard", "Overview", LayoutDashboard],
              ["accounts", "Accounts", Wallet],
              ["transactions", "Transactions", ReceiptText],
              ["budgets", "Budgets", Target],
            ].map(([key, label, Icon]) => (
              <button key={key}
                className={`nav-item ${page === key ? "active" : ""}`}
                onClick={() => setPage(key)}>
                <Icon size={19} /> {label}
              </button>
            ))}
          </nav>
          <div className="sidebar-info">
            <ShieldCheck size={18} />
            <div>
              <strong>Private workspace</strong>
              <span>Your financial data is yours.</span>
            </div>
          </div>
        </div>
        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">
              {session.user.email?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="profile-info">
              <strong>My workspace</strong>
              <span>{session.user.email}</span>
            </div>
          </div>
          <button className="nav-item signout" onClick={signOut}>
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>
            <strong>{pageTitles[page]}</strong>
          </div>
          <div className="topbar-actions">
            <button className="secondary-button" onClick={openAccountModal}>
              <Plus size={16} /> Account
            </button>
            <button className="primary-button"
              onClick={() => openTransactionModal()}>
              <Plus size={17} /> Transaction
            </button>
          </div>
        </header>

        <main className="dashboard-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "budgets" ? "YOUR SAVINGS PLAN" : "YOUR FINANCES"}
              </div>
              <h1>{pageTitles[page]}</h1>
              <p>{pageDescriptions[page]}</p>
            </div>
            <button className="refresh-button" onClick={refreshData}
              disabled={dataLoading}>
              <RefreshCw size={17}
                className={dataLoading ? "spin" : ""} />
              Refresh
            </button>
          </div>

          {dataError && <Notice>{dataError}</Notice>}

          {dataLoading ? (
            <div className="data-loading">
              <LoaderCircle className="spin" size={25} />
              Loading your finances...
            </div>
          ) : (
            <>
              {(page === "dashboard" || page === "accounts") && (
                <>
                  <div className="summary-grid">
                    <SummaryCard label="Total cash" value={money(totalCash)}
                      Icon={Wallet}
                      detail={`${cashAccounts.length} cash accounts`} />
                    <SummaryCard label="Credit card debt"
                      value={money(totalDebt)} Icon={CreditCard}
                      detail={`${creditAccounts.length} credit cards`} />
                    <SummaryCard label="Net position"
                      value={money(netWorth)} Icon={TrendingUp}
                      detail="Cash minus card debt" featured />
                  </div>

                  {page === "dashboard" && (
                    <div className="section-heading">
                      <div>
                        <h2>Your accounts</h2>
                        <p>Live balances calculated from Supabase.</p>
                      </div>
                      <button className="section-link"
                        onClick={() => setPage("accounts")}>
                        View all <ArrowRight size={16} />
                      </button>
                    </div>
                  )}

                  {accounts.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon"><Wallet size={27} /></div>
                      <h2>Start with your first account.</h2>
                      <p>Add checking, savings, cash, or credit.</p>
                      <button className="primary-button"
                        onClick={openAccountModal}>
                        <Plus size={18} /> Add your first account
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="account-grid">
                        {accounts.map((account) => (
                          <AccountCard key={account.id}
                            account={account}
                            onAction={openTransactionModal} />
                        ))}
                        <button className="add-account-card"
                          onClick={openAccountModal}>
                          <div className="add-account-icon">
                            <Plus size={22} />
                          </div>
                          <strong>Add another account</strong>
                          <span>Checking, savings, cash, or credit</span>
                        </button>
                      </div>

                      {creditAccounts.length > 0 && (
                        <div className="credit-overview">
                          <div className="credit-overview-top">
                            <div>
                              <div className="eyebrow">CREDIT OVERVIEW</div>
                              <h2>Credit utilization</h2>
                              <p>How much of your credit limit you're using.</p>
                            </div>
                            <strong>{creditUtilization.toFixed(1)}%</strong>
                          </div>
                          <div className="progress-track">
                            <div className="progress-fill"
                              style={{ width: `${Math.max(0,
                                Math.min(creditUtilization, 100))}%` }} />
                          </div>
                          <div className="credit-stats">
                            <div>
                              <span>Total credit limit</span>
                              <strong>{money(totalCreditLimit)}</strong>
                            </div>
                            <div>
                              <span>Remaining credit</span>
                              <strong>{money(availableCredit)}</strong>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {(page === "dashboard" || page === "transactions") && (
                <div className="transactions-section">
                  <div className="section-heading">
                    <div>
                      <h2>Transaction history</h2>
                      <p>Deposits, expenses, transfers, and payments.</p>
                    </div>
                    {page === "dashboard" && (
                      <button className="section-link"
                        onClick={() => setPage("transactions")}>
                        View all <ArrowRight size={16} />
                      </button>
                    )}
                  </div>

                  {transactions.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">
                        <ReceiptText size={26} />
                      </div>
                      <h2>No transactions yet.</h2>
                      <p>Record your first money movement.</p>
                      <button className="primary-button"
                        onClick={() => openTransactionModal()}>
                        <Plus size={18} /> Add transaction
                      </button>
                    </div>
                  ) : (
                    <div className="transaction-list">
                      {(page === "dashboard"
                        ? transactions.slice(0, 5)
                        : transactions).map((t) => {
                        const income = t.type === "income";
                        const transfer = t.type === "transfer";
                        const payment = t.type === "card_payment";
                        const Icon = income ? ArrowDownLeft
                          : transfer ? ArrowLeftRight
                          : payment ? CreditCard : ArrowUpRight;

                        const title = t.merchant || (
                          income ? "Money added"
                            : transfer ? "Account transfer"
                            : payment ? "Credit card payment"
                            : "Expense"
                        );

                        const accountDescription =
                          transfer || payment
                            ? `${accountName(t.from_account_id)} → ${accountName(t.to_account_id)}`
                            : accountName(income
                              ? t.to_account_id : t.from_account_id);

                        return (
                          <div className="transaction-row" key={t.id}>
                            <div className={`transaction-icon ${
                              income ? "incoming" : ""}`}>
                              <Icon size={20} />
                            </div>
                            <div className="transaction-details">
                              <strong>{title}</strong>
                              <span>
                                {accountDescription} · {t.transaction_date}
                                {t.category ? ` · ${t.category}` : ""}
                              </span>
                            </div>
                            <div className={`transaction-amount ${
                              income ? "positive" : ""}`}>
                              {income ? "+" : transfer ? "" : "-"}
                              {money(t.amount)}
                            </div>
                            <div className="transaction-row-actions"
                              style={{ display: "flex", gap: 6, marginLeft: 8 }}>
                              <button type="button"
                                className="secondary-button"
                                style={{ padding: "8px" }}
                                title="Edit transaction"
                                aria-label={`Edit ${title}`}
                                onClick={() => editTransaction(t)}>
                                <Pencil size={15} />
                              </button>
                              <button type="button"
                                className="secondary-button"
                                style={{ padding: "8px" }}
                                title="Delete transaction"
                                aria-label={`Delete ${title}`}
                                onClick={() => {
                                  setFormError("");
                                  setDeletingTransaction(t);
                                }}>
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {page === "budgets" && (
                <UltraSaver
                  userId={userId}
                  transactions={transactions}
                  accounts={accounts}
                />
              )}
            </>
          )}
        </main>
      </div>

      {accountModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card" role="dialog" aria-modal="true"
            aria-labelledby="account-modal-title">
            <div className="modal-header">
              <div>
                <div className="eyebrow">NEW ACCOUNT</div>
                <h2 id="account-modal-title">Add an account</h2>
                <p>Tell us where your money is held.</p>
              </div>
              <button className="close-button"
                onClick={() => setAccountModalOpen(false)}
                disabled={saving} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={createAccount}>
              <label className="field-label">Account type</label>
              <div className="type-grid">
                {accountTypes.map(({ value, label, Icon }) => (
                  <button type="button" key={value}
                    className={`type-option ${
                      accountForm.type === value ? "selected" : ""}`}
                    onClick={() => setAccountForm((f) => ({
                      ...f, type: value,
                    }))}>
                    <Icon size={20} /><span>{label}</span>
                  </button>
                ))}
              </div>

              <label className="field-label">Account name</label>
              <input className="form-input" placeholder="Main Checking"
                value={accountForm.name}
                onChange={(e) => setAccountForm((f) => ({
                  ...f, name: e.target.value,
                }))} required />

              <label className="field-label">
                {accountForm.type === "credit"
                  ? "Current amount owed" : "Current balance"}
              </label>
              <div className="money-input">
                <span>$</span>
                <input type="number" min="0" step="0.01"
                  value={accountForm.opening_balance}
                  onChange={(e) => setAccountForm((f) => ({
                    ...f, opening_balance: e.target.value,
                  }))} placeholder="0.00" />
              </div>

              {accountForm.type === "credit" && (
                <>
                  <label className="field-label">Credit limit</label>
                  <div className="money-input">
                    <span>$</span>
                    <input type="number" min="0" step="0.01"
                      value={accountForm.credit_limit}
                      onChange={(e) => setAccountForm((f) => ({
                        ...f, credit_limit: e.target.value,
                      }))} placeholder="5000.00" />
                  </div>
                </>
              )}

              {formError && <Notice>{formError}</Notice>}
              <div className="modal-actions">
                <button type="button" className="secondary-button"
                  onClick={() => setAccountModalOpen(false)}
                  disabled={saving}>Cancel</button>
                <button type="submit" className="primary-button"
                  disabled={saving}>
                  {saving ? <LoaderCircle className="spin" size={18} />
                    : <><Plus size={18} /> Create account</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {transactionModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card" role="dialog" aria-modal="true"
            aria-labelledby="transaction-modal-title">
            <div className="modal-header">
              <div>
                <div className="eyebrow">
                  {editingId ? "EDIT RECORD" : "MONEY MOVEMENT"}
                </div>
                <h2 id="transaction-modal-title">
                  {editingId ? "Edit transaction" : "New transaction"}
                </h2>
                <p>
                  {editingId
                    ? "Changes automatically recalculate balances."
                    : "Record money moving in, out, or between accounts."}
                </p>
              </div>
              <button className="close-button"
                onClick={() => setTransactionModalOpen(false)}
                disabled={saving} aria-label="Close">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveTransaction}>
              <label className="field-label">Transaction type</label>
              <div className="transaction-type-grid">
                {transactionTypes.map(({ value, label, Icon }) => (
                  <button type="button" key={value}
                    className={`transaction-type-option ${
                      transactionForm.type === value ? "selected" : ""}`}
                    onClick={() => changeTransactionType(value)}>
                    <Icon size={19} /><span>{label}</span>
                  </button>
                ))}
              </div>

              <label className="field-label">Amount</label>
              <div className="money-input">
                <span>$</span>
                <input type="number" min="0.01" step="0.01"
                  value={transactionForm.amount}
                  onChange={(e) => updateTransaction("amount", e.target.value)}
                  placeholder="0.00" required />
              </div>

              {transactionForm.type !== "income" && (
                <>
                  <label className="field-label">
                    {transactionForm.type === "expense"
                      ? "Account used" : "From account"}
                  </label>
                  <select className="form-input"
                    value={transactionForm.from_account_id}
                    onChange={(e) =>
                      updateTransaction("from_account_id", e.target.value)}
                    required>
                    <option value="">Select source account</option>
                    {accounts.filter((a) =>
                      transactionForm.type === "expense" ||
                      a.type !== "credit"
                    ).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} — {money(a.balance)}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {transactionForm.type !== "expense" && (
                <>
                  <label className="field-label">
                    {transactionForm.type === "income"
                      ? "Deposit into"
                      : transactionForm.type === "card_payment"
                      ? "Credit card to pay"
                      : "To account"}
                  </label>
                  <select className="form-input"
                    value={transactionForm.to_account_id}
                    onChange={(e) =>
                      updateTransaction("to_account_id", e.target.value)}
                    required>
                    <option value="">Select destination account</option>
                    {accounts.filter((a) =>
                      transactionForm.type === "card_payment"
                        ? a.type === "credit"
                        : a.type !== "credit"
                    ).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} — {money(a.balance)}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {transactionForm.type === "transfer" && (
                <div className="helper-note">
                  Transfers move money between your accounts without
                  creating income or spending. Transfers into savings
                  count toward your savings progress.
                </div>
              )}

              {transactionForm.type === "card_payment" && (
                <div className="helper-note">
                  Card payments reduce cash and card debt. They are
                  not counted as new spending in your budget.
                </div>
              )}

              {["income", "expense"].includes(transactionForm.type) && (
                <>
                  <label className="field-label">Category</label>
                  <select className="form-input"
                    value={transactionForm.category}
                    onChange={(e) =>
                      updateTransaction("category", e.target.value)}>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <label className="field-label">Description (optional)</label>
              <input className="form-input"
                placeholder="What was this for?"
                value={transactionForm.merchant}
                onChange={(e) =>
                  updateTransaction("merchant", e.target.value)} />

              <label className="field-label">Note (optional)</label>
              <input className="form-input"
                placeholder="Additional details"
                value={transactionForm.note}
                onChange={(e) =>
                  updateTransaction("note", e.target.value)} />

              <label className="field-label">Date</label>
              <input className="form-input" type="date"
                value={transactionForm.transaction_date}
                onChange={(e) =>
                  updateTransaction("transaction_date", e.target.value)}
                required />

              {formError && <Notice>{formError}</Notice>}
              <div className="modal-actions">
                <button type="button" className="secondary-button"
                  onClick={() => setTransactionModalOpen(false)}
                  disabled={saving}>Cancel</button>
                <button type="submit" className="primary-button"
                  disabled={saving}>
                  {saving ? <LoaderCircle className="spin" size={18} />
                    : <><CheckCircle2 size={18} />
                        {editingId ? "Save changes" : "Save transaction"}
                      </>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingTransaction && (
        <div className="modal-backdrop">
          <div className="modal-card" role="alertdialog"
            aria-modal="true" aria-labelledby="delete-title"
            aria-describedby="delete-description">
            <div className="modal-header">
              <div>
                <div className="eyebrow">CONFIRM DELETION</div>
                <h2 id="delete-title">Delete transaction?</h2>
                <p id="delete-description">
                  Delete {money(deletingTransaction.amount)} from
                  {` ${deletingTransaction.transaction_date}`}?
                  This cannot be undone. Affected account balances
                  and savings progress will recalculate.
                </p>
              </div>
              <button className="close-button"
                onClick={() => setDeletingTransaction(null)}
                disabled={saving} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            {formError && <Notice>{formError}</Notice>}
            <div className="modal-actions">
              <button className="secondary-button"
                onClick={() => setDeletingTransaction(null)}
                disabled={saving}>Cancel</button>
              <button className="primary-button"
                onClick={deleteTransaction} disabled={saving}>
                {saving ? <LoaderCircle className="spin" size={18} />
                  : <><Trash2 size={17} /> Delete transaction</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
