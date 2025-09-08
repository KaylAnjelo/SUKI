// Vendor Sales Comparison
const vendorSalesCtx = document.getElementById("vendorSalesChart").getContext("2d");
new Chart(vendorSalesCtx, {
  type: "bar",
  data: {
    labels: ["Vendor A", "Vendor B", "Vendor C", "Vendor D"],
    datasets: [
      {
        label: "Total Sales (₱)",
        data: [50000, 35000, 28000, 15000], // replace with dynamic data
        backgroundColor: "rgba(125, 0, 6, 0.8)", // #7D0006
        borderRadius: 6
      }
    ]
  },
  options: {
    responsive: true,
    plugins: {
      legend: { display: false }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 10000 }
      }
    }
  }
});

// Transactions Over Time
const transactionsCtx = document.getElementById("transactionsChart").getContext("2d");
new Chart(transactionsCtx, {
  type: "line",
  data: {
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    datasets: [
      {
        label: "Transactions",
        data: [120, 150, 180, 90, 200, 170, 140], // replace with dynamic data
        borderColor: "rgba(125, 0, 6, 1)",
        backgroundColor: "rgba(125, 0, 6, 0.2)",
        tension: 0.3,
        fill: true,
        pointRadius: 4,
        pointBackgroundColor: "#7D0006"
      }
    ]
  },
  options: {
    responsive: true,
    plugins: {
      legend: { display: false }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 50 }
      }
    }
  }
});

// ========== Points Issued vs Redeemed ==========
const pointsCtx = document.getElementById("pointsChart").getContext("2d");
new Chart(pointsCtx, {
  type: "bar",
  data: {
    labels: ["Issued", "Redeemed"],
    datasets: [
      {
        label: "Points",
        data: [4500, 3200], // replace with dynamic data
        backgroundColor: [
          "rgba(39, 174, 96, 0.8)", // green
          "rgba(199, 44, 65, 0.8)"  // red
        ],
        borderRadius: 6
      }
    ]
  },
  options: {
    responsive: true,
    plugins: {
      legend: { display: false }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  }
});