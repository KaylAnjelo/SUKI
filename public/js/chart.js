<script>
  // Safely hydrate chart data
  const pointsPerDayLabels = {{#if pointsPerDayLabels}}{{{pointsPerDayLabels}}}{{else}}[]{{/if}};
  const pointsPerDayData = {{#if pointsPerDayData}}{{{pointsPerDayData}}}{{else}}[]{{/if}};
  const storeLabels = {{#if storeLabels}}{{{storeLabels}}}{{else}}[]{{/if}};
  const storeEngagementData = {{#if storeEngagementData}}{{{storeEngagementData}}}{{else}}[]{{/if}};

  // Register DataLabels plugin
  if (window.Chart && window.ChartDataLabels) {
    Chart.register(ChartDataLabels);
  }

  // ===== BAR / LINE CHART: Points Earned Per Day =====
  const pointsPerDayCtx = document.getElementById('pointsPerDayChart').getContext('2d');

  // Gradient for bar chart
  const gradient = pointsPerDayCtx.createLinearGradient(0, 0, 0, 400);
  gradient.addColorStop(0, '#C72C41');
  gradient.addColorStop(1, '#7D0006');

  let pointsPerDayChart = new Chart(pointsPerDayCtx, {
    type: 'bar',
    data: {
      labels: pointsPerDayLabels,
      datasets: [{
        label: 'Points Earned',
        data: pointsPerDayData,
        backgroundColor: gradient,
        borderColor: '#7D0006',
        borderWidth: 2,
        hoverBackgroundColor: '#F8C471'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 1200,
        easing: 'easeOutBounce'
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 5 }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            font: { size: 14, weight: 'bold' },
            color: '#333'
          }
        },
        tooltip: {
          enabled: true,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw} pts`
          }
        },
        datalabels: {
          anchor: 'end',
          align: 'top',
          color: '#333',
          font: { size: 12, weight: 'bold' }
        }
      }
    }
  });

  // ===== PIE CHART: Store Engagement =====
  const storeEngagementCtx = document.getElementById('storeEngagementChart').getContext('2d');
  const storeEngagementChart = new Chart(storeEngagementCtx, {
    type: 'pie',
    data: {
      labels: storeLabels,
      datasets: [{
        label: 'Customer Engagement',
        data: storeEngagementData,
        backgroundColor: [
          '#7D0006', '#C72C41', '#F5B7B1', '#F8C471', '#7FB3D5', '#27AE60'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, activeEls) => {
        if (activeEls.length > 0) {
          const index = activeEls[0].index;
          const store = storeLabels[index];
          alert(`Clicked on: ${store}`);
          // 👉 You can filter table data or redirect here
        }
      },
      plugins: {
        legend: {
          position: 'right',
          labels: {
            font: { size: 13, weight: 'bold' },
            color: '#444'
          }
        },
        datalabels: {
          color: '#fff',
          font: { weight: 'bold' },
          formatter: (value, ctx) => {
            const label = ctx.chart?.data?.labels?.[ctx.dataIndex] || '';
            const data = ctx.dataset?.data || [];
            const total = data.reduce((a, b) => a + (Number(b) || 0), 0);
            const pct = total ? (value / total * 100).toFixed(1) : 0;
            return `${label}: ${value} (${pct}%)`;
          }
        }
      }
    }
  });

  // ===== DROPDOWN TO SWITCH BAR → LINE =====
  const chartTypeSelect = document.createElement('select');
  chartTypeSelect.innerHTML = `
    <option value="bar">Bar</option>
    <option value="line">Line</option>
  `;
  chartTypeSelect.style.margin = "10px";
  document.querySelector(".charts-row").prepend(chartTypeSelect);

  chartTypeSelect.addEventListener('change', (e) => {
    pointsPerDayChart.destroy();
    pointsPerDayChart = new Chart(pointsPerDayCtx, {
      type: e.target.value,
      data: {
        labels: pointsPerDayLabels,
        datasets: [{
          label: 'Points Earned',
          data: pointsPerDayData,
          backgroundColor: gradient,
          borderColor: '#7D0006',
          borderWidth: 2,
          hoverBackgroundColor: '#F8C471'
        }]
      },
      options: pointsPerDayChart.options // reuse same options
    });
  });
</script>