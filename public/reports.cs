body {
  font-family: Arial;
  background: #f8fafc;
  color: #0f172a;
}

body.dark {
  background: #0f172a;
  color: #e2e8f0;
}

h1 {
  margin-bottom: 20px;
}

/* CARDS */
.cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 15px;
}

.card {
  background: white;
  padding: 20px;
  border-radius: 12px;
  font-weight: bold;
}

body.dark .card {
  background: #1e293b;
}

/* CHARTS */
.charts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-top: 20px;
}

.chart-box {
  background: white;
  padding: 15px;
  border-radius: 12px;
}

body.dark .chart-box {
  background: #1e293b;
}

/* TABLE (FIXED) */
table {
  width: 100%;
  margin-top: 20px;
  background: transparent; /* 🔥 FIX */
}

body.dark table {
  background: transparent; /* 🔥 FIX */
}


/* FILTERS */
.filters button {
  margin-right: 10px;
}

/* EXPORT */
.export {
  margin-top: 20px;
}







/* CARD STYLE */
.top-clients-card {
  background: linear-gradient(145deg, #0f2a3d, #0b1f2e);
  padding: 20px;
  border-radius: 16px;
  color: #fff;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}

/* HEADER */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.card-header h3 {
  margin: 0;
}

.card-header .sub {
  font-size: 12px;
  opacity: 0.6;
}

/* TABLE */
.clients-table {
  width: 100%;
  border-collapse: collapse;
}

.clients-table th {
  text-align: left;
  font-size: 12px;
  opacity: 0.6;
  padding-bottom: 10px;
}

.clients-table td {
  padding: 14px 0;
  border-top: 1px solid rgba(255,255,255,0.05);
}

/* CLIENT CELL */
.client-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* AVATAR STACK (like screenshot circles) */
.avatar-group {
  display: flex;
}

/* CLIENT CELL */
.client-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* AVATAR */
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #3b82f6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  color: white;
}

/* TEXT BLOCK */
.client-info {
  display: flex;
  flex-direction: column;
}

.client-info .name {
  font-weight: 600;
}

.client-info .sub-text {
  font-size: 12px;
  opacity: 0.6;
}

/* MONEY */
.money {
  font-weight: 600;
}

/* COUNT */
.count {
  opacity: 0.8;
}


/* FIRST AVATAR no overlap */
.avatar:first-child {
  margin-left: 0;
}

/* MONEY */
.money {
  font-weight: 600;
}





.top-clients-card {
  background: #0f172a !important;
  color: #fff !important;
  padding: 20px;
  border-radius: 16px;
}




.clients-table {
  width: 100%;
  border-collapse: collapse;
  color: #fff;
}

.clients-table th {
  color: rgba(255,255,255,0.6);
  text-align: left;
  font-size: 12px;
}

.clients-table td {
  padding: 12px 0;
  border-top: 1px solid rgba(255,255,255,0.05);
}


.top-clients-card {
  background: linear-gradient(145deg, #0f2a3d, #0b1f2e) !important;
}





.clients-table td {
  color: #ffffff !important;
}

.clients-table th {
  color: rgba(255,255,255,0.7) !important;
}


.clients-table tr {
  color: #fff !important;
}



.clients-table {
  color: #fff !important;
}

.clients-table td,
.clients-table th {
  color: #fff !important;
}







/* 🔥 FORCE VISIBILITY FIX */
.top-clients-card,
.top-clients-card * {
  color: #ffffff !important;
}

/* headers softer */
.top-clients-card th {
  color: rgba(255,255,255,0.6) !important;
}

/* row separation */
.top-clients-card td {
  border-top: 1px solid rgba(255,255,255,0.08);
}

/* optional hover */
.top-clients-card tr:hover {
  background: rgba(255,255,255,0.05);
}





.table-wrapper {
  background: transparent !important;
}

.top-clients-card table {
  background: transparent !important;
}





.chart-card {
  background: #ffffff;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.05);
  margin-top: 20px;
}

/* HEADER */
.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.chart-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: #111;
}

/* DROPDOWN */
.chart-filter {
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  background: #fafafa;
  cursor: pointer;
}

/* CANVAS SIZE */
.chart-card canvas {
  width: 100% !important;
  height: 300px !important;
}








/* CARD */

/* HEADER */
.report-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
}

.report-header h3 {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 6px;
}

/* LEGEND */
.legend {
  font-size: 13px;
  color: #666;
  display: flex;
  gap: 15px;
  align-items: center;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 5px;
}

.dot.expense {
  background: #e74c3c;
}

.dot.income {
  background: #27ae60;
}

/* DROPDOWN */
.report-filter {
  border: 1px solid #eee;
  border-radius: 10px;
  padding: 6px 12px;
  background: #fafafa;
  font-size: 13px;
  cursor: pointer;
}


.dashboard {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

@media (max-width: 768px) {
  .dashboard {
    grid-template-columns: 1fr;
  }
}











.report-card {
  width: 100%;
  overflow: hidden;
}

/* 📱 MOBILE */
@media (max-width: 768px) {
  .report-card {
    padding: 15px;
  }

  .report-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .report-filter {
    width: 100%;
  }

  .report-card canvas {
    height: 250px !important;
  }
}










/* MOBILE */
@media (max-width: 768px) {
  .client-cell {
    gap: 8px;
  }

  .avatar {
    width: 28px;
    height: 28px;
    font-size: 12px;
  }

  .name {
    font-size: 13px;
  }

  .sub-text {
    font-size: 11px;
  }
}





.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 15px;
}

/* 📱 MOBILE */
@media (max-width: 768px) {
  .stats {
    grid-template-columns: 1fr;
  }
}




* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 10px;
}







body, html {
  overflow-x: hidden;
}

.container, .dashboard {
  width: 100%;
  max-width: 100%;
}



.report-card {
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}

/* 🔥 CRITICAL FIX */
.report-card canvas {
  width: 100% !important;
  height: auto !important;
  max-width: 100%;
}



options: {
  responsive: true,
  maintainAspectRatio: false, // 🔥 VERY IMPORTANT
}


.report-card {
  height: 300px;
}

@media (max-width: 768px) {
  .report-card {
    height: 250px;
  }
}


.table-wrapper {
  width: 100%;
  overflow-x: auto;
}

.clients-table {
  width: 100%;
  min-width: 500px;
}



.report-header {
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .report-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .report-filter {
    width: 100%;
  }
}



