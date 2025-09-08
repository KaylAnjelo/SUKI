// Sales Trend Chart
const salesTrendCtx = document.getElementById("salesTrendChart").getContext("2d");

new Chart(salesTrendCtx, {
  type: "line",
  data: {
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], // Example labels
    datasets: [
      {
        label: "Sales (₱)",
        data: [1200, 1500, 1800, 900, 2200, 1900, 1700], // Example data
        borderColor: "rgba(125, 0, 6, 1)", // #7D0006
        backgroundColor: "rgba(125, 0, 6, 0.2)",
        fill: true,
        tension: 0.3,
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
      y: { beginAtZero: true }
    }
  }
});

// Top Products Chart
const topProductsCtx = document.getElementById("topProductsChart").getContext("2d");

new Chart(topProductsCtx, {
  type: "doughnut",
  data: {
    labels: ["Burger", "Fries", "Soda", "Pizza", "Chicken"], // Example products
    datasets: [
      {
        label: "Sales Count",
        data: [120, 90, 60, 50, 40], // Example data
        backgroundColor: [
          "#7D0006",
          "#C72C41",
          "#F8C471",
          "#7FB3D5",
          "#27AE60"
        ],
        borderWidth: 0,
        cutout: "70%"
      }
    ]
  },
  options: {
    responsive: true,
    plugins: {
      legend: { position: "bottom" }
    }
  }
});