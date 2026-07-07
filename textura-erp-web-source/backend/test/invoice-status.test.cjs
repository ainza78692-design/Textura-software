const assert = require("node:assert/strict");
const test = require("node:test");
const { calculateFinalStatus } = require("../dist/services/invoice-status.js");

test("final status is rejected when any document is rejected", () => {
  assert.equal(calculateFinalStatus(["approved", "rejected", "pending"]), "rejected");
});

test("final status is approved only when every document is approved", () => {
  assert.equal(calculateFinalStatus(["approved", "approved"]), "approved");
});

test("final status remains pending for incomplete or empty workflows", () => {
  assert.equal(calculateFinalStatus(["approved", "pending"]), "pending");
  assert.equal(calculateFinalStatus([]), "pending");
});

test("optional document statuses are ignored when caller passes only required statuses", () => {
  const requiredStatuses = ["approved", "approved", "approved", "approved", "approved", "approved", "approved"];
  assert.equal(calculateFinalStatus(requiredStatuses), "approved");
});
