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
const STORAGE_KEY = "australia-financial-planner:v1";
const TAP_SUPPRESSION_MS = 700;
let lastTouchActivation = 0;

const fields = {
  finalNetWorth: document.querySelector("#final-net-worth"),
  realNetWorth: document.querySelector("#real-net-worth"),
  yearOneTax: document.querySelector("#year-one-tax"),
  yearOneSurplus: document.querySelector("#year-one-surplus"),
  finalEquity: document.querySelector("#final-equity"),
  finalIpEquity: document.querySelector("#final-ip-equity"),
  finalHomeEquity: document.querySelector("#final-home-equity"),
  finalCash: document.querySelector("#final-cash"),
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
        createPropertyCard(property, { shouldUpdate: false })
      );
    }
  } catch (error) {
    console.warn("Unable to restore planner inputs.", error);
  }
}

function getInputs() {
  const data = new FormData(form);
  return {
    employmentIncome: numberValue("employmentIncome"),
    otherIncome: numberValue("otherIncome"),
    livingExpenses: numberValue("livingExpenses"),
    cash: numberValue("cash"),
    workingYears: Math.max(0, Math.min(50, Math.round(numberValue("workingYears")))),
    retirementExpenseRate: percent("retirementExpenseRate"),
    taxYear: data.get("taxYear"),
    includeMedicare: data.get("includeMedicare") === "on",
    inflationRate: percent("inflationRate"),
    equityValue: numberValue("equityValue"),
    equityContribution: numberValue("equityContribution"),
    equityGrowthRate: percent("equityGrowthRate"),
    dividendYield: percent("dividendYield"),
    reinvestDividends: data.get("reinvestDividends") === "on",
    investmentProperties: getInvestmentProperties(),
    homeValue: numberValue("homeValue"),
    homeLoan: numberValue("homeLoan"),
    homeGrowthRate: percent("homeGrowthRate"),
    homeInterestRate: percent("homeInterestRate"),
    homePayment: numberValue("homePayment"),
    years: Math.max(1, Math.min(50, Math.round(numberValue("years"))))
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
  const properties = inputs.investmentProperties.map((property) => ({ ...property }));
  let homeValue = inputs.homeValue;
  let homeLoan = inputs.homeLoan;

  for (let year = 1; year <= inputs.years; year += 1) {
    const isWorkingYear = year <= inputs.workingYears;
    const expenseInflator = Math.pow(1 + inputs.inflationRate, year - 1);
    const fullLivingExpenses = inputs.livingExpenses * expenseInflator;
    const livingExpenses = isWorkingYear
      ? fullLivingExpenses
      : fullLivingExpenses * inputs.retirementExpenseRate;
    const employmentIncome = isWorkingYear ? inputs.employmentIncome : 0;
    const equityContribution = inputs.equityContribution * expenseInflator;

    const equityDividends = equity * inputs.dividendYield;
    const propertyTotals = properties.reduce(
      (totals, property) => {
        const rentInflator = Math.pow(1 + property.rentalIncreaseRate, year - 1);
        const rentalIncome = property.rentalIncome * rentInflator;
        const expenses = property.expenses * expenseInflator;
        const interest = Math.max(0, property.loan * property.interestRate);
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

    const homeInterest = Math.max(0, homeLoan * inputs.homeInterestRate);
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

    cash += cashSurplus;
    equity = equity * (1 + inputs.equityGrowthRate) + equityContribution + reinvestedDividends;
    for (const property of properties) {
      const interest = Math.max(0, property.loan * property.interestRate);
      const principal = Math.min(property.loan, Math.max(0, property.payment - interest));
      property.value *= 1 + property.growthRate;
      property.loan = Math.max(0, property.loan - principal);
    }
    homeValue *= 1 + inputs.homeGrowthRate;
    homeLoan = Math.max(0, homeLoan - homePrincipal);

    const ipEquity = properties.reduce(
      (total, property) => total + property.value - property.loan,
      0
    );
    const homeEquity = homeValue - homeLoan;
    const netWorth = cash + equity + ipEquity + homeEquity;
    const realNetWorth = netWorth / Math.pow(1 + inputs.inflationRate, year);

    rows.push({
      year,
      taxableIncome,
      tax,
      cashSurplus,
      cash,
      equity,
      ipEquity,
      homeEquity,
      netWorth,
      realNetWorth
    });
  }

  return rows;
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
  if (options.shouldUpdate !== false) {
    update();
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
  update();
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
  ctx.fillText("Year 1", padding.left, rect.height - 12);
  ctx.fillText(`Year ${rows.length}`, padding.left + width, rect.height - 12);

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
      money(row.taxableIncome),
      money(row.tax),
      money(row.cashSurplus),
      money(row.equity),
      money(row.ipEquity),
      money(row.homeEquity),
      money(row.netWorth),
      money(row.realNetWorth)
    ];

    cells.forEach((cell, index) => {
      const td = document.createElement("td");
      td.textContent = cell;
      if (index > 0 && String(cell).includes("-")) {
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
  const first = rows[0];
  const last = rows[rows.length - 1];

  setMoney(fields.finalNetWorth, last.netWorth);
  setMoney(fields.realNetWorth, last.realNetWorth);
  setMoney(fields.yearOneTax, first.tax);
  setMoney(fields.yearOneSurplus, first.cashSurplus);
  setMoney(fields.finalEquity, last.equity);
  setMoney(fields.finalIpEquity, last.ipEquity);
  setMoney(fields.finalHomeEquity, last.homeEquity);
  setMoney(fields.finalCash, last.cash);
  fields.chartCaption.textContent = `${inputs.taxYear}, ${inputs.years} years`;

  drawChart(rows);
  renderTable(rows);
  saveState();
}

form.addEventListener("input", update);
activateOnTap(addPropertyButton, () => createPropertyCard());
window.addEventListener("resize", update);
restoreState();
refreshPropertyControls();
update();
