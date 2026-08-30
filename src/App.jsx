import { useState } from "react";
import { createWorker } from "tesseract.js";
import "./App.css";

const PERSON_COLORS = [
  "#4F46E5", // Indigo
  "#9333EA", // Purple
  "#EA580C", // Orange
  "#0891B2", // Cyan
  "#DB2777", // Pink
  "#16A34A", // Green
];

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
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
    : receipt
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
        } catch (error) {
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
  };

  // =============================
  // COPY SUMMARY
  // =============================

  const copySummary = async () => {
    if (!splitResult) return;

    const lines = [
      "Bill Split — Your Receipt",
      "",
      ...Object.entries(splitResult).map(
        ([person, amount]) =>
          `${person}: $${formatMoney(amount)}`
      ),
      "",
      `Total: $${formatMoney(
        Object.values(splitResult).reduce(
          (total, amount) => total + amount,
          0
        )
      )}`,
    ];

    const summary = lines.join("\n");

    try {
      await navigator.clipboard.writeText(summary);
      alert("Summary copied to clipboard!");
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

        <p>
          Upload a receipt and let SmartSplit
          automatically extract items and
          calculate everyone's share.
        </p>

        {/* =============================
            PROGRESS
        ============================= */}

        <div className="progress-container">

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

            const completed =
              currentStep > step.number;

            const active =
              currentStep === step.number;

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

                  <span>
                    {step.label}
                  </span>
                </div>

                {index < 2 && (
                  <div
                    className={`progress-line ${
                      completed
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
          <>
            <label className="upload-button">
              <span>📸</span>
              Upload Receipt

              <input
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={handleUpload}
                hidden
              />
            </label>

            <div className="file-types">
              JPG, PNG or WebP
            </div>
          </>
        )}

        {/* =============================
            RECEIPT
        ============================= */}

        {receipt && (
          <div className="receipt-preview">

            <div className="preview-header">
              <div>
                <span className="section-kicker">
                  RECEIPT
                </span>

                <h2>
                  Receipt Preview
                </h2>
              </div>

              {!loading && (
                <button
                  className="new-receipt-button"
                  onClick={resetApp}
                >
                  🔄 New Receipt
                </button>
              )}
            </div>

            <img
              src={receipt}
              alt="Uploaded receipt"
            />

            {/* =============================
                LOADING
            ============================= */}

            {loading && (
              <div className="loading-card">

                <div className="loading-icon">
                  ✦
                </div>

                <div className="loading-content">

                  <h3>
                    Analyzing your receipt...
                  </h3>

                  <p>
                    Extracting items, prices and
                    billing information
                  </p>

                  <div className="skeleton-line" />
                  <div className="skeleton-line short" />

                </div>

              </div>
            )}

            {!loading && items.length > 0 && (
              <>

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
                        🧾 Extracted Items
                      </h2>
                    </div>

                    <span className="item-count">
                      {items.length} items
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

                            <span>
                              {item.name}
                            </span>
                          </div>

                          <strong>
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
                    BILL SUMMARY
                ============================= */}

                {(subtotal !== null ||
                  tax !== null ||
                  receiptTotal !== null) && (

                  <section className="zone summary-zone">

                    <div className="section-title">
                      <div>
                        <span className="section-kicker">
                          PAYMENT
                        </span>

                        <h2>
                          🧾 Bill Summary
                        </h2>
                      </div>
                    </div>

                    {subtotal !== null && (
                      <div className="summary-row">
                        <span>
                          Subtotal
                        </span>

                        <strong>
                          ${formatMoney(subtotal)}
                        </strong>
                      </div>
                    )}

                    {tax !== null && (
                      <div className="summary-row">
                        <span>
                          Tax
                        </span>

                        <strong>
                          ${formatMoney(tax)}
                        </strong>
                      </div>
                    )}

                    {receiptTotal !== null && (
                      <div className="summary-total">
                        <span>
                          Receipt Total
                        </span>

                        <strong>
                          ${formatMoney(
                            receiptTotal
                          )}
                        </strong>
                      </div>
                    )}

                  </section>
                )}

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
                      (person, index) => {

                        const color =
                          getPersonColor(
                            person
                          );

                        return (
                          <div
                            className="person"
                            key={person}
                            style={{
                              "--person-color":
                                color,
                            }}
                          >
                            <span className="person-dot" />

                            <span>
                              {person}
                            </span>

                            {person !== "You" && (
                              <button
                                onClick={() =>
                                  removePerson(
                                    person
                                  )
                                }
                              >
                                Remove
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
                      placeholder="Enter person's name"
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

                  {/* WARNING */}

                  {unassignedItems.length > 0 && (
                    <div className="warning-banner">

                      <span className="warning-icon">
                        ⚠️
                      </span>

                      <div>
                        <strong>
                          Some items need attention
                        </strong>

                        <p>
                          {unassignedItems
                            .map(
                              (item) =>
                                `${item.name} has no one assigned`
                            )
                            .join(
                              " • "
                            )}
                          {" — the total won't be accurate."}
                        </p>
                      </div>

                    </div>
                  )}

                  {items.map(
                    (item, index) => {

                      const assignedPeople =
                        assignments[index] ||
                        [];

                      return (
                        <div
                          className={`assignment-card ${
                            assignedPeople.length === 0
                              ? "unassigned"
                              : ""
                          }`}
                          key={index}
                        >

                          <div className="assignment-header">

                            <div>
                              <strong>
                                {item.name}
                              </strong>

                              <span>
                                ${formatMoney(
                                  item.price
                                )}
                              </span>
                            </div>

                            {assignedPeople.length === 0 && (
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

                                    <span>
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

                              <strong>
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

                </section>

                {/* =============================
                    CALCULATE
                ============================= */}

                <button
                  className="calculate-button"
                  onClick={calculateSplit}
                >
                  Calculate My Split
                  <span>→</span>
                </button>

                {/* =============================
                    FINAL RESULT
                ============================= */}

                {splitResult && (
                  <section className="final-zone">

                    <div className="final-header">

                      <div>
                        <span className="section-kicker">
                          ALL DONE
                        </span>

                        <h2>
                          💰 Your Final Split
                        </h2>

                        <p>
                          Everyone's share is
                          calculated.
                        </p>
                      </div>

                      <button
                        className="copy-button"
                        onClick={copySummary}
                      >
                        📋 Copy Summary
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
                            person
                              .trim()
                              .charAt(0)
                              .toUpperCase();

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

                                <span>
                                  {person}
                                </span>

                                <small>
                                  Your share
                                </small>

                              </div>

                              <strong>
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
                          Who pays what
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

                                <span>
                                  {item.name}
                                </span>

                                <strong>
                                  ${formatMoney(
                                    item.price
                                  )}
                                </strong>

                              </div>

                              {assignedPeople.length >
                              0 ? (
                                assignedPeople.map(
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

                                        <div>
                                          <span
                                            className="breakdown-dot"
                                            style={{
                                              backgroundColor:
                                                color,
                                            }}
                                          />

                                          <span>
                                            {person}
                                          </span>
                                        </div>

                                        <strong>
                                          $
                                          {formatMoney(
                                            share
                                          )}
                                        </strong>

                                      </div>
                                    );
                                  }
                                )
                              ) : (
                                <div className="breakdown-person">
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

                      <span>
                        Total
                      </span>

                      <strong>
                        $
                        {formatMoney(
                          resultTotal
                        )}
                      </strong>

                    </div>

                    {receiptTotal !== null && (
                      <div className="receipt-total-info">
                        🧾 Receipt Total: $
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
                  <span>🧾</span>

                  <h3>
                    No items detected
                  </h3>

                  <p>
                    Try uploading a clearer
                    receipt.
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