const TAX_TABLES = {
  "2025-26": [
    { threshold: 0, base: 0, rate: 0 },
    { threshold: 18200, base: 0, rate: 0.16 },
    { threshold: 45000, base: 4288, rate: 0.3 },
    { threshold: 135000, base: 31288, rate: 0.37 },
    { threshold: 190000, base: 51638, rate: 0.45 }
  ],
  "2026-27": [
    { threshold: 0, base: 0, rate: 0 },
    { threshold: 18200, base: 0, rate: 0.15 },
    { threshold: 45000, base: 4020, rate: 0.3 },
    { threshold: 135000, base: 31020, rate: 0.37 },
    { threshold: 190000, base: 51370, rate: 0.45 }
  ]
};

const form = document.querySelector("#planner-form");
const chart = document.querySelector("#net-worth-chart");
const ctx = chart.getContext("2d");
const body = document.querySelector("#projection-body");
const propertyList = document.querySelector("#property-list");
const propertyEmpty = document.querySelector("#property-empty");
const addPropertyButton = document.querySelector("#add-property");
const calculateButton = document.querySelector("#calculate-plan");
const optimizeButton = document.querySelector("#optimize-plan");
const optimizerOutput = document.querySelector("#optimizer-output");
const STORAGE_KEY = "australia-financial-planner:v1";
const TAP_SUPPRESSION_MS = 700;
let lastTouchActivation = 0;
let latestRows = [];

const fields = {
  finalNetWorth: document.querySelector("#final-net-worth"),
  realNetWorth: document.querySelector("#real-net-worth"),
  yearOneTax: document.querySelector("#year-one-tax"),
  yearOneSurplus: document.querySelector("#year-one-surplus"),
  finalEquity: document.querySelector("#final-equity"),
  finalSuper: document.querySelector("#final-super"),
  finalIpEquity: document.querySelector("#final-ip-equity"),
  finalHomeEquity: document.querySelector("#final-home-equity"),
  finalCash: document.querySelector("#final-cash"),
  finalOffsets: document.querySelector("#final-offsets"),
  chartCaption: document.querySelector("#chart-caption")
};

function money(value) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function numberValue(name) {
  const value = Number(new FormData(form).get(name));
  return Number.isFinite(value) ? value : 0;
}

function inputNumber(input) {
  if (!input) {
    return 0;
  }

  const value = Number(input.value);
  return Number.isFinite(value) ? value : 0;
}

function percent(name) {
  return numberValue(name) / 100;
}

function propertyNumber(card, field) {
  return inputNumber(card.querySelector(`[data-field="${field}"]`));
}

function valueOrDefault(value, fallback) {
  return value === undefined || value === null || value === "" ? fallback : value;
}

function activateOnTap(element, handler) {
  if (!element || element.dataset.tapBound === "true") {
    return;
  }

  element.dataset.tapBound = "true";
  element.addEventListener(
    "touchend",
    (event) => {
      event.preventDefault();
      lastTouchActivation = Date.now();
      handler(event);
    },
    { passive: false }
  );
  element.addEventListener("click", (event) => {
    if (Date.now() - lastTouchActivation < TAP_SUPPRESSION_MS) {
      event.preventDefault();
      return;
    }

    handler(event);
  });
}

function findPropertyCard(node) {
  let current = node;

  while (current && current !== propertyList) {
    if (current.hasAttribute && current.hasAttribute("data-property-card")) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function getInvestmentProperties() {
  return [...propertyList.querySelectorAll("[data-property-card]")].map((card) => ({
    value: propertyNumber(card, "value"),
    loan: propertyNumber(card, "loan"),
    offset: propertyNumber(card, "offset"),
    growthRate: propertyNumber(card, "growthRate") / 100,
    interestRate: propertyNumber(card, "interestRate") / 100,
    rentalIncome: propertyNumber(card, "rentalIncome"),
    rentalIncreaseRate: propertyNumber(card, "rentalIncreaseRate") / 100,
    expenses: propertyNumber(card, "expenses"),
    payment: propertyNumber(card, "payment")
  }));
}

function getPropertyState() {
  return [...propertyList.querySelectorAll("[data-property-card]")].map((card) => ({
    value: propertyNumber(card, "value"),
    loan: propertyNumber(card, "loan"),
    offset: propertyNumber(card, "offset"),
    growthRate: propertyNumber(card, "growthRate"),
    interestRate: propertyNumber(card, "interestRate"),
    rentalIncome: propertyNumber(card, "rentalIncome"),
    rentalIncreaseRate: propertyNumber(card, "rentalIncreaseRate"),
    expenses: propertyNumber(card, "expenses"),
    payment: propertyNumber(card, "payment")
  }));
}

function getFormState() {
  const controls = [...form.querySelectorAll("input[name], select[name]")];
  const fields = {};

  for (const control of controls) {
    fields[control.name] =
      control.type === "checkbox" ? control.checked : control.value;
  }

  return {
    fields,
    investmentProperties: getPropertyState()
  };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getFormState()));
  } catch (error) {
    console.warn("Unable to save planner inputs.", error);
  }
}

function applySavedFields(fields) {
  if (!fields || typeof fields !== "object") {
    return;
  }

  for (const [name, value] of Object.entries(fields)) {
    const control = form.elements[name];
    if (!control) {
      continue;
    }

    if (control.type === "checkbox") {
      control.checked = Boolean(value);
    } else {
      control.value = value;
    }
  }
}

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== "object") {
      return;
    }

    applySavedFields(saved.fields);

    if (Array.isArray(saved.investmentProperties)) {
      propertyList.innerHTML = "";
      saved.investmentProperties.forEach((property) =>
        createPropertyCard(property, { shouldUpdate: false, shouldSave: false })
      );
    }
  } catch (error) {
    console.warn("Unable to restore planner inputs.", error);
  }
}

function getInputs() {
  const data = new FormData(form);
  const currentAge = Math.max(0, Math.min(120, Math.round(numberValue("currentAge"))));
  const lifeExpectancy = Math.max(
    currentAge,
    Math.min(120, Math.round(numberValue("lifeExpectancy")))
  );

  return {
    employmentIncome: numberValue("employmentIncome"),
    otherIncome: numberValue("otherIncome"),
    livingExpenses: numberValue("livingExpenses"),
    cash: numberValue("cash"),
    currentAge,
    lifeExpectancy,
    workingYears: Math.max(0, Math.min(50, Math.round(numberValue("workingYears")))),
    retirementExpenseRate: percent("retirementExpenseRate"),
    taxYear: data.get("taxYear"),
    includeMedicare: data.get("includeMedicare") === "on",
    inflationRate: percent("inflationRate"),
    superBalance: numberValue("superBalance"),
    employerSuperRate: percent("employerSuperRate"),
    concessionalCap: numberValue("concessionalCap"),
    superContributionTaxRate: percent("superContributionTaxRate"),
    superGrowthRate: percent("superGrowthRate"),
    superAccessAge: Math.max(0, Math.min(100, Math.round(numberValue("superAccessAge")))),
    equityValue: numberValue("equityValue"),
    equityContribution: numberValue("equityContribution"),
    equityGrowthRate: percent("equityGrowthRate"),
    dividendYield: percent("dividendYield"),
    reinvestDividends: data.get("reinvestDividends") === "on",
    investmentProperties: getInvestmentProperties(),
    homeValue: numberValue("homeValue"),
    homeLoan: numberValue("homeLoan"),
    homeOffset: numberValue("homeOffset"),
    homeGrowthRate: percent("homeGrowthRate"),
    homeInterestRate: percent("homeInterestRate"),
    homePayment: numberValue("homePayment"),
    optimizerGoal: data.get("optimizerGoal"),
    cashReserveMonths: Math.max(0, numberValue("cashReserveMonths")),
    years: Math.max(1, lifeExpectancy - currentAge + 1)
  };
}

function incomeTax(taxableIncome, taxYear) {
  const income = Math.max(0, taxableIncome);
  const table = TAX_TABLES[taxYear] || TAX_TABLES["2025-26"];
  let band = table[0];

  for (const candidate of table) {
    if (income >= candidate.threshold) {
      band = candidate;
    }
  }

  return band.base + (income - band.threshold) * band.rate;
}

function totalTax(taxableIncome, inputs) {
  const baseTax = incomeTax(taxableIncome, inputs.taxYear);
  const medicare = inputs.includeMedicare ? Math.max(0, taxableIncome) * 0.02 : 0;
  return baseTax + medicare;
}

function calculateProjection(inputs) {
  const rows = [];
  let cash = inputs.cash;
  let equity = inputs.equityValue;
  let superBalance = inputs.superBalance;
  const properties = inputs.investmentProperties.map((property) => ({ ...property }));
  let homeValue = inputs.homeValue;
  let homeLoan = inputs.homeLoan;
  const offsetBalance =
    inputs.homeOffset +
    properties.reduce((total, property) => total + property.offset, 0);

  for (let year = 1; year <= inputs.years; year += 1) {
    const age = inputs.currentAge + year - 1;
    const isWorkingYear = year <= inputs.workingYears;
    const canAccessSuper = !isWorkingYear && age >= inputs.superAccessAge;
    const expenseInflator = Math.pow(1 + inputs.inflationRate, year - 1);
    const fullLivingExpenses = inputs.livingExpenses * expenseInflator;
    const livingExpenses = isWorkingYear
      ? fullLivingExpenses
      : fullLivingExpenses * inputs.retirementExpenseRate;
    const employmentIncome = isWorkingYear ? inputs.employmentIncome : 0;
    const equityContribution = isWorkingYear
      ? inputs.equityContribution * expenseInflator
      : 0;
    const grossSuperContribution = isWorkingYear
      ? Math.min(employmentIncome * inputs.employerSuperRate, inputs.concessionalCap)
      : 0;
    const netSuperContribution =
      grossSuperContribution * (1 - inputs.superContributionTaxRate);

    const equityDividends = equity * inputs.dividendYield;
    const propertyTotals = properties.reduce(
      (totals, property) => {
        const rentInflator = Math.pow(1 + property.rentalIncreaseRate, year - 1);
        const rentalIncome = property.rentalIncome * rentInflator;
        const expenses = property.expenses * expenseInflator;
        const interestBearingLoan = Math.max(0, property.loan - property.offset);
        const interest = Math.max(0, interestBearingLoan * property.interestRate);
        const principal = Math.min(
          property.loan,
          Math.max(0, property.payment - interest)
        );
        const mortgagePayment = interest + principal;

        totals.rentalTaxable += rentalIncome - expenses - interest;
        totals.cashflow += rentalIncome - expenses - mortgagePayment;

        return totals;
      },
      { rentalTaxable: 0, cashflow: 0 }
    );
    const taxableIncome =
      employmentIncome +
      inputs.otherIncome +
      equityDividends +
      propertyTotals.rentalTaxable;
    const tax = totalTax(taxableIncome, inputs);

    const homeInterestBearingLoan = Math.max(0, homeLoan - inputs.homeOffset);
    const homeInterest = Math.max(0, homeInterestBearingLoan * inputs.homeInterestRate);
    const homePrincipal = Math.min(homeLoan, Math.max(0, inputs.homePayment - homeInterest));
    const dividendCash = inputs.reinvestDividends ? 0 : equityDividends;
    const reinvestedDividends = inputs.reinvestDividends ? equityDividends : 0;
    const cashSurplus =
      employmentIncome +
      inputs.otherIncome +
      dividendCash +
      propertyTotals.cashflow -
      tax -
      livingExpenses -
      equityContribution -
      inputs.homePayment;

    let adjustedCashSurplus = cashSurplus;
    equity = equity * (1 + inputs.equityGrowthRate) + equityContribution + reinvestedDividends;
    superBalance = superBalance * (1 + inputs.superGrowthRate) + netSuperContribution;
    for (const property of properties) {
      const interestBearingLoan = Math.max(0, property.loan - property.offset);
      const interest = Math.max(0, interestBearingLoan * property.interestRate);
      const principal = Math.min(property.loan, Math.max(0, property.payment - interest));
      property.value *= 1 + property.growthRate;
      property.loan = Math.max(0, property.loan - principal);
    }
    homeValue *= 1 + inputs.homeGrowthRate;
    homeLoan = Math.max(0, homeLoan - homePrincipal);

    if (!isWorkingYear && adjustedCashSurplus < 0) {
      let shortfall = -adjustedCashSurplus;
      if (canAccessSuper) {
        const superWithdrawal = Math.min(superBalance, shortfall);
        superBalance -= superWithdrawal;
        shortfall -= superWithdrawal;
      }

      if (shortfall > 0) {
        const equityWithdrawal = Math.min(equity, shortfall);
        equity -= equityWithdrawal;
        shortfall -= equityWithdrawal;
      }

      adjustedCashSurplus = -shortfall;
    }

    cash += adjustedCashSurplus;
    const ipEquity = properties.reduce(
      (total, property) => total + property.value - property.loan,
      0
    );
    const homeEquity = homeValue - homeLoan;
    const netWorth = cash + equity + superBalance + ipEquity + homeEquity + offsetBalance;
    const realNetWorth = netWorth / Math.pow(1 + inputs.inflationRate, year);

    rows.push({
      year,
      age,
      taxableIncome,
      tax,
      cashSurplus: adjustedCashSurplus,
      cash,
      offsetBalance,
      equity,
      superBalance,
      ipEquity,
      homeEquity,
      netWorth,
      realNetWorth
    });
  }

  return rows;
}

function cloneInputs(inputs) {
  return {
    ...inputs,
    investmentProperties: inputs.investmentProperties.map((property) => ({ ...property }))
  };
}

function getLiquidPool(inputs) {
  return (
    inputs.cash +
    inputs.equityValue +
    inputs.investmentProperties.reduce((total, property) => total + property.offset, 0)
  );
}

function getCashReserve(inputs, pool) {
  return Math.min(Math.max(0, pool), inputs.livingExpenses * (inputs.cashReserveMonths / 12));
}

function createAllocation(name, inputs, reserve) {
  return {
    name,
    cash: reserve,
    equityValue: 0,
    homeOffset: inputs.homeOffset,
    propertyOffsets: inputs.investmentProperties.map(() => 0)
  };
}

function applyTargetAllocation(allocation, amount, targets) {
  let remaining = amount;

  for (const target of targets) {
    if (remaining <= 0) {
      break;
    }

    const applied = Math.min(remaining, target.capacity);
    if (target.type === "home") {
      allocation.homeOffset += applied;
    } else {
      allocation.propertyOffsets[target.index] += applied;
    }
    remaining -= applied;
  }

  return remaining;
}

function getOffsetTargets(inputs, scope = "all") {
  const targets = [];

  if (scope !== "home") {
    inputs.investmentProperties.forEach((property, index) => {
      targets.push({
        capacity: Math.max(0, property.loan),
        index,
        rate: property.interestRate,
        type: "property"
      });
    });
  }

  return targets
    .filter((target) => target.capacity > 0 && target.rate > 0)
    .sort((a, b) => b.rate - a.rate);
}

function buildAllocations(inputs) {
  const pool = getLiquidPool(inputs);
  const reserve = getCashReserve(inputs, pool);
  const allocatable = Math.max(0, pool - reserve);
  const allocations = [
    {
      name: "Current allocation",
      cash: inputs.cash,
      equityValue: inputs.equityValue,
      homeOffset: inputs.homeOffset,
      propertyOffsets: inputs.investmentProperties.map((property) => property.offset)
    }
  ];

  const equityFocus = createAllocation("Equity focus", inputs, reserve);
  equityFocus.equityValue = allocatable;
  allocations.push(equityFocus);

  const investmentOffsets = createAllocation("Investment offsets first", inputs, reserve);
  investmentOffsets.equityValue = applyTargetAllocation(
    investmentOffsets,
    allocatable,
    getOffsetTargets(inputs, "investment")
  );
  allocations.push(investmentOffsets);

  const highestRateOffsets = createAllocation("Highest-rate offsets first", inputs, reserve);
  highestRateOffsets.equityValue = applyTargetAllocation(
    highestRateOffsets,
    allocatable,
    getOffsetTargets(inputs)
  );
  allocations.push(highestRateOffsets);

  const balanced = createAllocation("Balanced equity and offsets", inputs, reserve);
  const offsetBudget = allocatable / 2;
  balanced.equityValue =
    allocatable -
    offsetBudget +
    applyTargetAllocation(balanced, offsetBudget, getOffsetTargets(inputs));
  allocations.push(balanced);

  return allocations;
}

function applyAllocationToInputs(inputs, allocation, workingYears = inputs.workingYears) {
  const next = cloneInputs(inputs);
  next.cash = allocation.cash;
  next.equityValue = allocation.equityValue;
  next.homeOffset = inputs.homeOffset;
  next.workingYears = workingYears;
  next.investmentProperties.forEach((property, index) => {
    property.offset = allocation.propertyOffsets[index] || 0;
  });
  return next;
}

function evaluatePlan(inputs, allocation, workingYears = inputs.workingYears) {
  const next = applyAllocationToInputs(inputs, allocation, workingYears);
  const rows = calculateProjection(next);
  const final = rows[rows.length - 1];
  return {
    allocation,
    final,
    inputs: next,
    isFeasible: rows.every((row) => row.cash >= -1) && final.netWorth >= 0,
    rows,
    workingYears
  };
}

function pickBestFinalNetWorth(inputs, allocations) {
  return allocations
    .map((allocation) => evaluatePlan(inputs, allocation))
    .reduce((best, candidate) =>
      !best || candidate.final.netWorth > best.final.netWorth ? candidate : best
    );
}

function pickMinimumWorkingYears(inputs, allocations) {
  let fallback = null;

  for (let years = 0; years <= inputs.workingYears; years += 1) {
    const feasible = allocations
      .map((allocation) => evaluatePlan(inputs, allocation, years))
      .filter((candidate) => candidate.isFeasible)
      .sort((a, b) => b.final.netWorth - a.final.netWorth);

    if (feasible.length > 0) {
      return { ...feasible[0], foundFeasibleEarlyRetirement: true };
    }
  }

  fallback = pickBestFinalNetWorth(inputs, allocations);
  return { ...fallback, foundFeasibleEarlyRetirement: false };
}

function setNamedInput(name, value) {
  const control = form.elements[name];
  if (control) {
    control.value = Math.round(value);
  }
}

function writeAllocationToForm(result) {
  setNamedInput("cash", result.inputs.cash);
  setNamedInput("equityValue", result.inputs.equityValue);
  setNamedInput("workingYears", result.inputs.workingYears);

  const cards = [...propertyList.querySelectorAll("[data-property-card]")];
  cards.forEach((card, index) => {
    const offsetInput = card.querySelector('[data-field="offset"]');
    if (offsetInput) {
      offsetInput.value = Math.round(
        result.inputs.investmentProperties[index]
          ? result.inputs.investmentProperties[index].offset
          : 0
      );
    }
  });
}

function getAllocationSummary(result) {
  const investmentOffsets = result.inputs.investmentProperties.reduce(
    (total, property) => total + property.offset,
    0
  );
  return [
    result.allocation.name,
    `cash ${money(result.inputs.cash)}`,
    `equities ${money(result.inputs.equityValue)}`,
    `home offset ${money(result.inputs.homeOffset)}`,
    `investment offsets ${money(investmentOffsets)}`
  ].join(" | ");
}

function optimizePlan() {
  const inputs = getInputs();
  const allocations = buildAllocations(inputs);
  const result =
    inputs.optimizerGoal === "minimize-working-years"
      ? pickMinimumWorkingYears(inputs, allocations)
      : pickBestFinalNetWorth(inputs, allocations);

  writeAllocationToForm(result);
  saveState();
  update();

  if (inputs.optimizerGoal === "minimize-working-years") {
    optimizerOutput.textContent = result.foundFeasibleEarlyRetirement
      ? `Optimised to ${result.workingYears} working years. ${getAllocationSummary(result)}. Final net worth ${money(result.final.netWorth)}.`
      : `No shorter feasible working period was found. Best tested plan kept ${result.workingYears} working years. ${getAllocationSummary(result)}. Final net worth ${money(result.final.netWorth)}.`;
    return;
  }

  optimizerOutput.textContent = `Optimised for final net worth. ${getAllocationSummary(result)}. Final net worth ${money(result.final.netWorth)}.`;
}

function createPropertyCard(values = {}, options = {}) {
  const index = propertyList.querySelectorAll("[data-property-card]").length + 1;
  const card = document.createElement("article");
  card.className = "property-card";
  card.dataset.propertyCard = "";
  card.innerHTML = `
    <div class="property-card-header">
      <h3>Property ${index}</h3>
      <button class="remove-property" type="button">Remove</button>
    </div>
    <div class="field-grid">
      <label>
        Property value
        <input data-field="value" type="number" min="0" step="1000" value="${valueOrDefault(values.value, 0)}">
      </label>
      <label>
        Loan balance
        <input data-field="loan" type="number" min="0" step="1000" value="${valueOrDefault(values.loan, 0)}">
      </label>
      <label>
        Offset balance
        <input data-field="offset" type="number" min="0" step="1000" value="${valueOrDefault(values.offset, 0)}">
      </label>
      <label>
        Price growth %
        <input data-field="growthRate" type="number" step="0.1" value="${valueOrDefault(values.growthRate, 4)}">
      </label>
      <label>
        Interest rate %
        <input data-field="interestRate" type="number" min="0" step="0.1" value="${valueOrDefault(values.interestRate, 6)}">
      </label>
      <label>
        Rental income
        <input data-field="rentalIncome" type="number" min="0" step="1000" value="${valueOrDefault(values.rentalIncome, 0)}">
      </label>
      <label>
        Rental increase %
        <input data-field="rentalIncreaseRate" type="number" min="0" step="0.1" value="${valueOrDefault(values.rentalIncreaseRate, 3)}">
      </label>
      <label>
        Property expenses
        <input data-field="expenses" type="number" min="0" step="1000" value="${valueOrDefault(values.expenses, 0)}">
      </label>
      <label>
        Annual mortgage payment
        <input data-field="payment" type="number" min="0" step="1000" value="${valueOrDefault(values.payment, valueOrDefault(values.principal, 0))}">
      </label>
    </div>
  `;
  propertyList.append(card);
  bindPropertyCard(card);
  refreshPropertyControls();
  if (options.shouldUpdate === true) {
    update();
  } else if (options.shouldSave !== false) {
    saveState();
  }
}

function bindPropertyCard(card) {
  activateOnTap(card.querySelector(".remove-property"), (event) => {
    removeProperty(event.currentTarget);
  });
}

function removeProperty(button) {
  const card = findPropertyCard(button);
  if (!card) {
    return;
  }

  card.remove();
  refreshPropertyControls();
  saveState();
}

function refreshPropertyControls() {
  const cards = [...propertyList.querySelectorAll("[data-property-card]")];
  cards.forEach((card, index) => {
    bindPropertyCard(card);
    card.querySelector("h3").textContent = `Property ${index + 1}`;
    card.querySelector(".remove-property").disabled = false;
  });
  propertyEmpty.hidden = cards.length !== 0;
}

function drawChart(rows) {
  const ratio = window.devicePixelRatio || 1;
  const rect = chart.getBoundingClientRect();
  chart.width = Math.max(1, Math.round(rect.width * ratio));
  chart.height = Math.max(1, Math.round(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const padding = { top: 24, right: 24, bottom: 42, left: 76 };
  const width = rect.width - padding.left - padding.right;
  const height = rect.height - padding.top - padding.bottom;
  const values = rows.flatMap((row) => [row.netWorth, row.realNetWorth]);
  const min = Math.min(0, ...values);
  const max = Math.max(...values, 1);
  const spread = max - min || 1;

  function x(index) {
    return padding.left + (rows.length === 1 ? width : (index / (rows.length - 1)) * width);
  }

  function y(value) {
    return padding.top + height - ((value - min) / spread) * height;
  }

  ctx.strokeStyle = "#d9e0e7";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 4; i += 1) {
    const lineY = padding.top + (height / 4) * i;
    ctx.moveTo(padding.left, lineY);
    ctx.lineTo(padding.left + width, lineY);
  }
  ctx.stroke();

  ctx.fillStyle = "#64707d";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i += 1) {
    const value = max - (spread / 4) * i;
    ctx.fillText(compactMoney(value), padding.left - 10, padding.top + (height / 4) * i);
  }

  drawLine(rows.map((row) => row.netWorth), "#0f766e");
  drawLine(rows.map((row) => row.realNetWorth), "#b45309");

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#0f766e";
  ctx.fillText("Nominal", padding.left, 16);
  ctx.fillStyle = "#b45309";
  ctx.fillText("Today's dollars", padding.left + 78, 16);

  ctx.fillStyle = "#64707d";
  ctx.textAlign = "center";
  ctx.fillText(`Age ${rows[0].age}`, padding.left, rect.height - 12);
  ctx.fillText(`Age ${rows[rows.length - 1].age}`, padding.left + width, rect.height - 12);

  function drawLine(series, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    series.forEach((value, index) => {
      const pointX = x(index);
      const pointY = y(value);
      if (index === 0) {
        ctx.moveTo(pointX, pointY);
      } else {
        ctx.lineTo(pointX, pointY);
      }
    });
    ctx.stroke();
  }
}

function compactMoney(value) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value || 0);
}

function setMoney(element, value) {
  element.textContent = money(value);
  element.classList.toggle("negative", value < 0);
}

function renderTable(rows) {
  body.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    const cells = [
      row.year,
      row.age,
      money(row.taxableIncome),
      money(row.tax),
      money(row.cashSurplus),
      money(row.equity),
      money(row.superBalance),
      money(row.ipEquity),
      money(row.homeEquity),
      money(row.netWorth),
      money(row.realNetWorth)
    ];

    cells.forEach((cell, index) => {
      const td = document.createElement("td");
      td.textContent = cell;
      if (index > 1 && String(cell).includes("-")) {
        td.classList.add("negative");
      }
      tr.append(td);
    });
    body.append(tr);
  }
}

function update() {
  const inputs = getInputs();
  const rows = calculateProjection(inputs);
  latestRows = rows;
  const first = rows[0];
  const last = rows[rows.length - 1];

  setMoney(fields.finalNetWorth, last.netWorth);
  setMoney(fields.realNetWorth, last.realNetWorth);
  setMoney(fields.yearOneTax, first.tax);
  setMoney(fields.yearOneSurplus, first.cashSurplus);
  setMoney(fields.finalEquity, last.equity);
  setMoney(fields.finalSuper, last.superBalance);
  setMoney(fields.finalIpEquity, last.ipEquity);
  setMoney(fields.finalHomeEquity, last.homeEquity);
  setMoney(fields.finalCash, last.cash);
  setMoney(fields.finalOffsets, last.offsetBalance);
  fields.chartCaption.textContent =
    `${inputs.taxYear}, age ${inputs.currentAge}-${inputs.lifeExpectancy}`;

  drawChart(rows);
  renderTable(rows);
  saveState();
}

form.addEventListener("input", saveState);
form.addEventListener("submit", (event) => event.preventDefault());
activateOnTap(addPropertyButton, () => createPropertyCard());
activateOnTap(calculateButton, update);
activateOnTap(optimizeButton, optimizePlan);
window.addEventListener("resize", () => {
  if (latestRows.length > 0) {
    drawChart(latestRows);
  }
});
restoreState();
refreshPropertyControls();
update();
