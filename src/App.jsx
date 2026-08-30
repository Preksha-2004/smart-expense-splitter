import { useState } from "react";
import { createWorker } from "tesseract.js";
import "./App.css";

const PERSON_COLORS = [
  "#4F46E5", // Indigo (You)
  "#9333EA", // Purple
  "#EA580C", // Orange
  "#0D9488", // Teal
  "#DB2777", // Pink
  "#2563EB", // Blue
  "#D97706", // Amber
  "#16A34A", // Green
];

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function getPersonInitial(name) {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase();
}

function App() {
  const [receipt, setReceipt] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const [people, setPeople] = useState(["You"]);
  const [newPerson, setNewPerson] = useState("");

  const [assignments, setAssignments] = useState({});
  const [splitResult, setSplitResult] = useState(null);

  const [subtotal, setSubtotal] = useState(null);
  const [tax, setTax] = useState(null);
  const [receiptTotal, setReceiptTotal] = useState(null);
  const [copied, setCopied] = useState(false);

  // =============================
  // PERSON COLOR
  // =============================

  const getPersonColor = (person) => {
    const index = people.indexOf(person);

    if (index === -1) {
      return PERSON_COLORS[0];
    }

    return PERSON_COLORS[index % PERSON_COLORS.length];
  };

  // =============================
  // PROGRESS STEP
  // =============================

  const currentStep = splitResult
    ? 3
    : receipt && !loading && items.length > 0
      ? 2
      : 1;

  // =============================
  // UPLOAD + OCR
  // =============================

  const handleUpload = async (event) => {
    const file = event.target.files[0];

    if (!file) return;

    const imageUrl = URL.createObjectURL(file);

    setReceipt(imageUrl);
    setItems([]);
    setAssignments({});
    setSplitResult(null);
    setSubtotal(null);
    setTax(null);
    setReceiptTotal(null);
    setLoading(true);

    let worker = null;

    try {
      console.log("Starting OCR...");

      worker = await createWorker("eng");

      const result = await worker.recognize(file);
      const extractedText = result.data.text;

      console.log("OCR TEXT:");
      console.log(extractedText);

      const lines = extractedText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      // =============================
      // EXTRACT SUBTOTAL, TAX, TOTAL
      // =============================

      let detectedSubtotal = null;
      let detectedTax = null;
      let detectedTotal = null;

      lines.forEach((line) => {
        const cleanedLine = line
          .replace(/(\d),(\d{2})/g, "$1.$2")
          .replace(/\$/g, "")
          .trim();

        const subtotalMatch = cleanedLine.match(
          /^subtotal\s+(\d+\.\d{2})$/i
        );

        const taxMatch = cleanedLine.match(
          /^tax\s+(\d+\.\d{2})$/i
        );

        const totalMatch = cleanedLine.match(
          /^total\s+(\d+\.\d{2})$/i
        );

        if (subtotalMatch) {
          detectedSubtotal = parseFloat(subtotalMatch[1]);
        }

        if (taxMatch) {
          detectedTax = parseFloat(taxMatch[1]);
        }

        if (totalMatch) {
          detectedTotal = parseFloat(totalMatch[1]);
        }
      });

      console.log("SUBTOTAL:", detectedSubtotal);
      console.log("TAX:", detectedTax);
      console.log("TOTAL:", detectedTotal);

      setSubtotal(detectedSubtotal);
      setTax(detectedTax);
      setReceiptTotal(detectedTotal);

      // =============================
      // EXTRACT ITEMS
      // =============================

      const detectedItems = [];

      lines.forEach((line) => {
        const cleanedLine = line
          .replace(/(\d),(\d{2})/g, "$1.$2")
          .replace(/\$/g, "")
          .trim();

        const match = cleanedLine.match(
          /^(.+?)\s+(\d+\.\d{2})$/
        );

        if (match) {
          const name = match[1].trim();
          const price = parseFloat(match[2]);

          const ignoredWords = [
            "subtotal",
            "tax",
            "total",
            "discount",
            "change",
            "cash",
            "payment",
            "store",
            "register",
            "date",
            "time",
          ];

          const isIgnored = ignoredWords.some((word) =>
            name.toLowerCase().includes(word)
          );

          if (!isIgnored && price > 0) {
            detectedItems.push({
              name,
              price,
            });
          }
        }
      });

      console.log("DETECTED ITEMS:");
      console.log(detectedItems);

      setItems(detectedItems);
    } catch (error) {
      console.error("OCR Error:", error);
      alert("Unable to read the receipt.");
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch {
          console.log("OCR worker already stopped.");
        }
      }

      setLoading(false);
    }
  };

  // =============================
  // ADD PERSON
  // =============================

  const addPerson = () => {
    const name = newPerson.trim();

    if (!name) return;

    if (people.includes(name)) {
      alert("This person is already added.");
      return;
    }

    setPeople([...people, name]);
    setNewPerson("");
  };

  // =============================
  // REMOVE PERSON
  // =============================

  const removePerson = (name) => {
    if (name === "You") return;

    setPeople(
      people.filter((person) => person !== name)
    );

    const updatedAssignments = { ...assignments };

    Object.keys(updatedAssignments).forEach((index) => {
      updatedAssignments[index] =
        updatedAssignments[index].filter(
          (person) => person !== name
        );
    });

    setAssignments(updatedAssignments);
    setSplitResult(null);
  };

  // =============================
  // ASSIGN PERSON TO ITEM
  // =============================

  const togglePersonForItem = (itemIndex, person) => {
    const currentPeople =
      assignments[itemIndex] || [];

    let updatedPeople;

    if (currentPeople.includes(person)) {
      updatedPeople = currentPeople.filter(
        (name) => name !== person
      );
    } else {
      updatedPeople = [
        ...currentPeople,
        person,
      ];
    }

    setAssignments({
      ...assignments,
      [itemIndex]: updatedPeople,
    });

    setSplitResult(null);
  };

  // =============================
  // CALCULATE SPLIT
  // =============================

  const calculateSplit = () => {
    const result = {};

    people.forEach((person) => {
      result[person] = 0;
    });

    // Check for unassigned items
    const unassignedItems = items.filter(
      (_, index) =>
        !assignments[index] ||
        assignments[index].length === 0
    );

    if (unassignedItems.length > 0) {
      alert(
        "Please assign every item to at least one person before calculating."
      );
      return;
    }

    // Calculate item shares
    items.forEach((item, index) => {
      const assignedPeople = assignments[index];

      const share =
        item.price / assignedPeople.length;

      assignedPeople.forEach((person) => {
        result[person] += share;
      });
    });

    // Calculate assigned total
    const assignedItemsTotal =
      Object.values(result).reduce(
        (total, amount) => total + amount,
        0
      );

    // Add tax / extra charges proportionally
    if (
      receiptTotal !== null &&
      assignedItemsTotal > 0
    ) {
      const extraAmount =
        receiptTotal - assignedItemsTotal;

      if (extraAmount > 0) {
        people.forEach((person) => {
          const proportion =
            result[person] /
            assignedItemsTotal;

          result[person] +=
            extraAmount * proportion;
        });
      }
    }

    // Round values
    Object.keys(result).forEach((person) => {
      result[person] = Number(
        result[person].toFixed(2)
      );
    });

    // Correct possible 1-cent rounding difference
    if (receiptTotal !== null) {
      const roundedTotal =
        Object.values(result).reduce(
          (total, amount) => total + amount,
          0
        );

      const difference = Number(
        (receiptTotal - roundedTotal).toFixed(2)
      );

      if (difference !== 0) {
        const lastPerson =
          people[people.length - 1];

        result[lastPerson] = Number(
          (
            result[lastPerson] + difference
          ).toFixed(2)
        );
      }
    }

    setSplitResult(result);
  };

  // =============================
  // RESET
  // =============================

  const resetApp = () => {
    setReceipt(null);
    setItems([]);
    setAssignments({});
    setSplitResult(null);
    setSubtotal(null);
    setTax(null);
    setReceiptTotal(null);
    setLoading(false);
    setPeople(["You"]);
    setNewPerson("");
    setCopied(false);
  };

  // =============================
  // COPY SUMMARY
  // =============================

  const copySummary = async () => {
    if (!splitResult) return;

    const lines = [
      "Bill Split",
      ...Object.entries(splitResult).map(
        ([person, amount]) =>
          `${person}: $${formatMoney(amount)}`
      ),
      `Total: $${formatMoney(
        Object.values(splitResult).reduce(
          (total, amount) => total + amount,
          0
        )
      )}`,
    ];

    const summary = lines.join("\n");

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(summary);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = summary;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (error) {
      console.error("Copy failed:", error);
      alert("Unable to copy summary.");
    }
  };

  // =============================
  // ITEMS TOTAL
  // =============================

  const itemsTotal = items.reduce(
    (total, item) => total + item.price,
    0
  );

  // =============================
  // UNASSIGNED ITEMS
  // =============================

  const unassignedItems = items.filter(
    (_, index) =>
      !assignments[index] ||
      assignments[index].length === 0
  );

  // =============================
  // RESULT TOTAL
  // =============================

  const resultTotal = splitResult
    ? Object.values(splitResult).reduce(
        (total, amount) => total + amount,
        0
      )
    : 0;

  // =============================
  // UI
  // =============================

  return (
    <div className="app">

      {/* NAVBAR */}

      <header className="navbar">
        <div className="logo">
          <span className="logo-icon">S</span>
          SmartSplit
        </div>

        <div className="tagline">
          Split bills without the math
        </div>
      </header>

      <main className="hero">

        {/* HERO */}

        <div className="hero-badge">
          ✦ Smart receipt splitting
        </div>

        <h1>
          Split Your Bill
          <br />
          <span>in Seconds.</span>
        </h1>

        <p className="hero-description">
          Upload a receipt and let SmartSplit automatically extract items and calculate everyone's fair share.
        </p>

        {/* =============================
            PROGRESS INDICATOR
        ============================= */}

        <div className="progress-container" aria-label="Step Progress">

          {[
            {
              number: 1,
              label: "Upload",
            },
            {
              number: 2,
              label: "Assign Items",
            },
            {
              number: 3,
              label: "Final Split",
            },
          ].map((step, index) => {

            const completed = currentStep > step.number;
            const active = currentStep === step.number;

            return (
              <div
                className="progress-wrapper"
                key={step.number}
              >

                <div
                  className={`progress-step ${
                    active ? "active" : ""
                  } ${
                    completed ? "completed" : ""
                  }`}
                >
                  <div className="progress-circle">
                    {completed
                      ? "✓"
                      : step.number}
                  </div>

                  <span className="progress-label">
                    {step.label}
                  </span>
                </div>

                {index < 2 && (
                  <div
                    className={`progress-line ${
                      currentStep > step.number
                        ? "completed"
                        : ""
                    }`}
                  />
                )}

              </div>
            );
          })}

        </div>

        {/* =============================
            UPLOAD
        ============================= */}

        {!receipt && (
          <div className="upload-container">
            <label className="upload-button">
              <span className="upload-icon">📸</span>
              <span>Upload Receipt</span>

              <input
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={handleUpload}
                hidden
              />
            </label>

            <div className="file-types">
              Supports JPG, PNG or WebP images
            </div>
          </div>
        )}

        {/* =============================
            RECEIPT
        ============================= */}

        {receipt && (
          <div className="receipt-preview">

            <div className="preview-header">
              <div>
                <span className="section-kicker">
                  RECEIPT PREVIEW
                </span>

                <h2>
                  Uploaded Receipt
                </h2>
              </div>

              {!loading && (
                <button
                  className="new-receipt-button"
                  onClick={resetApp}
                  title="Reset and upload a new receipt"
                >
                  🔄 New Receipt
                </button>
              )}
            </div>

            <div className="receipt-image-wrapper">
              <img
                src={receipt}
                alt="Uploaded receipt"
              />
            </div>

            {/* =============================
                LOADING
            ============================= */}

            {loading && (
              <div className="loading-card">
                <div className="loading-scanner">
                  <div className="scanner-line" />
                  <span className="receipt-doc-icon">🧾</span>
                </div>

                <div className="loading-content">
                  <h3>
                    Analyzing your receipt...
                  </h3>

                  <p>
                    Extracting items and prices
                  </p>

                  <div className="skeleton-container">
                    <div className="skeleton-line" />
                    <div className="skeleton-line medium" />
                    <div className="skeleton-line short" />
                  </div>
                </div>
              </div>
            )}

            {!loading && items.length > 0 && (
              <>

                {/* =============================
                    BILL SUMMARY
                ============================= */}

                {(subtotal !== null ||
                  tax !== null ||
                  receiptTotal !== null) && (

                  <section className="zone summary-zone">

                    <div className="section-title">
                      <div>
                        <span className="section-kicker">
                          PAYMENT DETAILS
                        </span>

                        <h2>
                          🧾 Bill Summary
                        </h2>
                      </div>
                    </div>

                    <div className="summary-card-inner">
                      {subtotal !== null && (
                        <div className="summary-row">
                          <span className="summary-label">Subtotal</span>
                          <strong className="summary-val">${formatMoney(subtotal)}</strong>
                        </div>
                      )}

                      {tax !== null && (
                        <div className="summary-row">
                          <span className="summary-label">Tax</span>
                          <strong className="summary-val">${formatMoney(tax)}</strong>
                        </div>
                      )}

                      {receiptTotal !== null && (
                        <div className="summary-total">
                          <span className="total-label">Receipt Total</span>
                          <strong className="total-val">${formatMoney(receiptTotal)}</strong>
                        </div>
                      )}
                    </div>

                  </section>
                )}

                {/* =============================
                    EXTRACTED ITEMS
                ============================= */}

                <section className="zone items-zone">

                  <div className="section-title">
                    <div>
                      <span className="section-kicker">
                        RECEIPT DATA
                      </span>

                      <h2>
                        📋 Extracted Items
                      </h2>
                    </div>

                    <span className="item-count">
                      {items.length} {items.length === 1 ? "item" : "items"}
                    </span>
                  </div>

                  <div className="items-list">

                    {items.map(
                      (item, index) => (
                        <div
                          className="item-row"
                          key={index}
                        >
                          <div className="item-info">
                            <span className="item-number">
                              {String(
                                index + 1
                              ).padStart(2, "0")}
                            </span>

                            <span className="item-name">
                              {item.name}
                            </span>
                          </div>

                          <strong className="item-price">
                            ${formatMoney(
                              item.price
                            )}
                          </strong>
                        </div>
                      )
                    )}

                  </div>

                  <div className="items-total">
                    <span>
                      Items Total
                    </span>

                    <strong>
                      ${formatMoney(itemsTotal)}
                    </strong>
                  </div>

                </section>

                {/* =============================
                    PEOPLE
                ============================= */}

                <section className="zone people-zone">

                  <div className="section-title">
                    <div>
                      <span className="section-kicker">
                        PARTICIPANTS
                      </span>

                      <h2>
                        👥 Split With
                      </h2>
                    </div>
                  </div>

                  <div className="people-list">

                    {people.map(
                      (person) => {

                        const color =
                          getPersonColor(
                            person
                          );

                        const initial =
                          getPersonInitial(
                            person
                          );

                        return (
                          <div
                            className="person-chip"
                            key={person}
                            style={{
                              "--person-color":
                                color,
                            }}
                          >
                            <span className="person-chip-avatar">
                              {initial}
                            </span>

                            <span className="person-chip-name">
                              {person}
                            </span>

                            {person !== "You" && (
                              <button
                                className="person-remove-btn"
                                onClick={() =>
                                  removePerson(
                                    person
                                  )
                                }
                                title={`Remove ${person}`}
                                aria-label={`Remove ${person}`}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      }
                    )}

                  </div>

                  <div className="add-person">

                    <input
                      type="text"
                      placeholder="Enter friend's name..."
                      value={newPerson}
                      onChange={(event) =>
                        setNewPerson(
                          event.target.value
                        )
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter"
                        ) {
                          addPerson();
                        }
                      }}
                    />

                    <button
                      className="add-person-btn"
                      onClick={addPerson}
                    >
                      + Add Person
                    </button>

                  </div>

                </section>

                {/* =============================
                    ASSIGNMENT
                ============================= */}

                <section className="zone assignment-zone">

                  <div className="section-title">
                    <div>
                      <span className="section-kicker">
                        STEP 2
                      </span>

                      <h2>
                        ☑️ Who had each item?
                      </h2>
                    </div>
                  </div>

                  {/* UNASSIGNED WARNING */}

                  {unassignedItems.length > 0 && (
                    <div className="warning-banner">

                      <span className="warning-icon">
                        ⚠️
                      </span>

                      <div className="warning-content">
                        <strong>
                          {unassignedItems.length === 1 ? "Unassigned Item" : "Unassigned Items"}
                        </strong>

                        <p>
                          {unassignedItems.length === 1
                            ? `${unassignedItems[0].name} has no one assigned — the total won't be accurate.`
                            : `${unassignedItems.map((item) => item.name).join(", ")} have no one assigned — the total won't be accurate.`}
                        </p>
                      </div>

                    </div>
                  )}

                  <div className="assignments-list">
                    {items.map(
                      (item, index) => {

                        const assignedPeople =
                          assignments[index] ||
                          [];

                        const isUnassigned = assignedPeople.length === 0;

                        return (
                          <div
                            className={`assignment-card ${
                              isUnassigned
                                ? "unassigned"
                                : ""
                            }`}
                            key={index}
                          >

                            <div className="assignment-header">

                              <div className="assignment-item-main">
                                <span className="assignment-item-name">
                                  {item.name}
                                </span>

                                <span className="assignment-item-price">
                                  ${formatMoney(
                                    item.price
                                  )}
                                </span>
                              </div>

                              {isUnassigned && (
                                <span className="needs-assignment">
                                  Needs assignment
                                </span>
                              )}

                            </div>

                            <div className="person-checkboxes">

                              {people.map(
                                (person) => {

                                  const color =
                                    getPersonColor(
                                      person
                                    );

                                  const initial =
                                    getPersonInitial(
                                      person
                                    );

                                  const selected =
                                    assignedPeople.includes(
                                      person
                                    );

                                  return (
                                    <label
                                      className={`person-checkbox ${
                                        selected
                                          ? "selected"
                                          : ""
                                      }`}
                                      key={person}
                                      style={{
                                        "--person-color":
                                          color,
                                      }}
                                    >

                                      <input
                                        type="checkbox"
                                        checked={
                                          selected
                                        }
                                        onChange={() =>
                                          togglePersonForItem(
                                            index,
                                            person
                                          )
                                        }
                                      />

                                      <span className="custom-checkbox">
                                        {selected
                                          ? "✓"
                                          : ""}
                                      </span>

                                      <span className="checkbox-avatar">
                                        {initial}
                                      </span>

                                      <span className="checkbox-name">
                                        {person}
                                      </span>

                                    </label>
                                  );
                                }
                              )}

                            </div>

                            {assignedPeople.length > 0 && (
                              <div className="share-info">

                                💡 Shared by{" "}
                                <strong>
                                  {
                                    assignedPeople.length
                                  }
                                </strong>{" "}
                                {assignedPeople.length ===
                                1
                                  ? "person"
                                  : "people"}

                                {" → "}

                                <strong className="share-amount">
                                  $
                                  {formatMoney(
                                    item.price /
                                      assignedPeople.length
                                  )}
                                </strong>

                                {" each"}

                              </div>
                            )}

                          </div>
                        );
                      }
                    )}
                  </div>

                </section>

                {/* =============================
                    CALCULATE BUTTON
                ============================= */}

                <button
                  className="calculate-button"
                  onClick={calculateSplit}
                >
                  <span>Calculate Split</span>
                  <span className="arrow-icon">→</span>
                </button>

                {/* =============================
                    FINAL RESULT
                ============================= */}

                {splitResult && (
                  <section className="final-zone">

                    <div className="final-header">

                      <div>
                        <span className="section-kicker">
                          STEP 3 · FINAL RESULTS
                        </span>

                        <h2>
                          💰 Final Split
                        </h2>

                        <p>
                          Everyone's share calculated with precision.
                        </p>
                      </div>

                      <button
                        className={`copy-button ${copied ? "copied" : ""}`}
                        onClick={copySummary}
                      >
                        {copied ? "✓ Summary Copied!" : "📋 Copy Summary"}
                      </button>

                    </div>

                    {/* PEOPLE TOTALS */}

                    <div className="result-people">

                      {Object.entries(
                        splitResult
                      ).map(
                        ([person, amount]) => {

                          const color =
                            getPersonColor(
                              person
                            );

                          const initial =
                            getPersonInitial(
                              person
                            );

                          return (
                            <div
                              className="result-card"
                              key={person}
                              style={{
                                "--person-color":
                                  color,
                              }}
                            >

                              <div
                                className="result-avatar"
                              >
                                {initial}
                              </div>

                              <div className="result-person-info">

                                <span className="result-person-name">
                                  {person}
                                </span>

                                <small className="result-person-label">
                                  {person === "You" ? "Your share" : "Total owed"}
                                </small>

                              </div>

                              <strong className="result-person-amount">
                                ${formatMoney(
                                  amount
                                )}
                              </strong>

                            </div>
                          );
                        }
                      )}

                    </div>

                    {/* ITEM BREAKDOWN */}

                    <div className="item-breakdown">

                      <div className="breakdown-title">
                        <h3>
                          📋 Item Breakdown
                        </h3>

                        <span>
                          Detailed cost assignment
                        </span>
                      </div>

                      {items.map(
                        (item, index) => {

                          const assignedPeople =
                            assignments[
                              index
                            ] || [];

                          return (
                            <div
                              className="breakdown-card"
                              key={index}
                            >

                              <div className="breakdown-item-header">

                                <span className="breakdown-item-name">
                                  {item.name}
                                </span>

                                <strong className="breakdown-item-price">
                                  ${formatMoney(
                                    item.price
                                  )}
                                </strong>

                              </div>

                              {assignedPeople.length >
                              0 ? (
                                <div className="breakdown-people-list">
                                  {assignedPeople.map(
                                    (person) => {

                                      const share =
                                        item.price /
                                        assignedPeople.length;

                                      const color =
                                        getPersonColor(
                                          person
                                        );

                                      return (
                                        <div
                                          className="breakdown-person"
                                          key={person}
                                        >

                                          <div className="breakdown-person-left">
                                            <span
                                              className="breakdown-dot"
                                              style={{
                                                backgroundColor:
                                                  color,
                                              }}
                                            />

                                            <span className="breakdown-person-name" style={{ color: color }}>
                                              👤 {person}
                                            </span>
                                          </div>

                                          <strong className="breakdown-person-share">
                                            $
                                            {formatMoney(
                                              share
                                            )}
                                          </strong>

                                        </div>
                                      );
                                    }
                                  )}
                                </div>
                              ) : (
                                <div className="breakdown-person unassigned-note">
                                  <span>
                                    ⚠️ Not assigned
                                  </span>

                                  <span>
                                    -
                                  </span>
                                </div>
                              )}

                            </div>
                          );
                        }
                      )}

                    </div>

                    {/* TOTAL */}

                    <div className="result-total">

                      <span className="result-total-label">
                        Total Split
                      </span>

                      <strong className="result-total-value">
                        $
                        {formatMoney(
                          resultTotal
                        )}
                      </strong>

                    </div>

                    {receiptTotal !== null && (
                      <div className="receipt-total-info">
                        ✓ Matches Receipt Total: $
                        {formatMoney(
                          receiptTotal
                        )}
                      </div>
                    )}

                  </section>
                )}

              </>
            )}

            {/* NO ITEMS */}

            {!loading &&
              items.length === 0 && (
                <div className="empty-state">
                  <span className="empty-icon">🧾</span>

                  <h3>
                    No items detected
                  </h3>

                  <p>
                    Try uploading a clearer, higher-resolution receipt.
                  </p>
                </div>
              )}

          </div>
        )}

      </main>

      <footer className="footer">
        SmartSplit · Simple. Fair. Automatic.
      </footer>

    </div>
  );
}

export default App;
