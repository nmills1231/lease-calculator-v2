'use client';

import { useState, useEffect } from 'react';
import { Save, Download, Building2, Calculator, Plus, Trash2, Edit2 } from 'lucide-react';
import jsPDF from 'jspdf';

export default function LeaseCalc() {
  const [activeTab, setActiveTab] = useState<'calculator' | 'saved'>('calculator');
  const [searchTerm, setSearchTerm] = useState('');

  // Core Inputs
  const [dealName, setDealName] = useState<string>('');
  const [sqft, setSqft] = useState<number>(0);
  const [rentQuotedAs, setRentQuotedAs] = useState<'sf' | 'annual'>('sf');
  const [rentAmount, setRentAmount] = useState<number>(0);
  const [years, setYears] = useState<number>(5);
  const [includeFreeRent, setIncludeFreeRent] = useState<boolean>(false);
  const [freeMonths, setFreeMonths] = useState<number>(2);
  const [extraMonths, setExtraMonths] = useState<number>(0);
  const [rentStructure, setRentStructure] = useState<'annual' | 'flat' | 'every-n' | 'flat-step'>('annual');

  // Rent Structure
  const [annualEscalation, setAnnualEscalation] = useState<number>(3);
  const [escalationType, setEscalationType] = useState<'percent' | 'dollar'>('percent');
  const [escalationFrequency, setEscalationFrequency] = useState<number>(3);
  const [flatYears, setFlatYears] = useState<number>(3);
  const [stepFrequency, setStepFrequency] = useState<number>(3);

  // Commission
  const [commissionType, setCommissionType] = useState<'flat' | 'tiered' | 'per-sf'>('flat');
  const [flatRate, setFlatRate] = useState<number>(3);
  const [perSfRate, setPerSfRate] = useState<number>(8.5);
  const [tiers, setTiers] = useState([{ from: 1, to: 5, rate: 6 }]);

  // Splits
  const [coBrokerSplit, setCoBrokerSplit] = useState<number>(0);

  // Notes
  const [notes, setNotes] = useState<string>('');

  // Commission Payment Split (defaults to true)
  const [splitPayments, setSplitPayments] = useState<boolean>(true);
  const [leaseExecutionDate, setLeaseExecutionDate] = useState<string>('');
  const [firstHalfPercent, setFirstHalfPercent] = useState<number>(50);
  const [daysToRentCommencement, setDaysToRentCommencement] = useState<number>(90);
  const [calculatedRentCommencementDate, setCalculatedRentCommencementDate] = useState<string>('');

  const [results, setResults] = useState<any>(null);
  const [lastCalculation, setLastCalculation] = useState<any>(null);
  const [savedDeals, setSavedDeals] = useState<any[]>([]);
  const [formattedDates, setFormattedDates] = useState<{ [key: number]: string }>({});

  // Auto-calculate Rent Commencement Date
  useEffect(() => {
    if (leaseExecutionDate && daysToRentCommencement > 0) {
      const execDate = new Date(leaseExecutionDate);
      const rentDate = new Date(execDate);
      rentDate.setDate(rentDate.getDate() + daysToRentCommencement);
      setCalculatedRentCommencementDate(rentDate.toISOString().split('T')[0]);
    } else {
      setCalculatedRentCommencementDate('');
    }
  }, [leaseExecutionDate, daysToRentCommencement]);

  useEffect(() => {
    const dates: { [key: number]: string } = {};
    savedDeals.forEach((deal) => {
      dates[deal.id] = new Date(deal.date).toLocaleDateString();
    });
    setFormattedDates(dates);
  }, [savedDeals]);

  const formatCurrency = (num: number) => {
    return '$' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric', year: 'numeric' 
    });
  };

  useEffect(() => {
    const saved = localStorage.getItem('leaseDeals');
    if (saved) setSavedDeals(JSON.parse(saved));
  }, []);

  // ==================== AUTO-CALCULATE ====================
  useEffect(() => {
    const timer = setTimeout(() => {
      if (sqft > 0 && rentAmount > 0 && years > 0) {
        calculate();
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [
    sqft, rentAmount, years, rentQuotedAs, includeFreeRent, freeMonths,
    rentStructure, annualEscalation, escalationType, escalationFrequency,
    flatYears, stepFrequency, commissionType, flatRate, perSfRate, tiers,
    coBrokerSplit, splitPayments, leaseExecutionDate, firstHalfPercent, daysToRentCommencement
  ]);

  // ==================== MAIN CALCULATION (Updated Logic) ====================
  const calculate = () => {
    const baseAnnual = rentQuotedAs === 'sf' ? rentAmount * sqft : rentAmount;
    let annualRents: number[] = [];
    let totalLease = 0;
    let remainingFree = includeFreeRent ? freeMonths : 0;

    for (let y = 1; y <= years; y++) {
      let rentThisYear = baseAnnual;

      if (rentStructure === 'annual') {
        if (escalationType === 'percent') {
          rentThisYear *= Math.pow(1 + annualEscalation / 100, y - 1);
        } else {
          rentThisYear += annualEscalation * (y - 1);
        }
      } else if (rentStructure === 'every-n') {
        const steps = Math.floor((y - 1) / escalationFrequency);
        if (escalationType === 'percent') {
          rentThisYear *= Math.pow(1 + annualEscalation / 100, steps);
        } else {
          rentThisYear += annualEscalation * steps;
        }
      } else if (rentStructure === 'flat-step') {
        if (y > flatYears) {
          const steps = Math.floor((y - flatYears - 1) / stepFrequency) + 1;
          if (escalationType === 'percent') {
            rentThisYear *= Math.pow(1 + annualEscalation / 100, steps);
          } else {
            rentThisYear += annualEscalation * steps;
          }
        }
      }

      if (remainingFree > 0) {
        const freeThisYear = Math.min(remainingFree, 12) * (rentThisYear / 12);
        rentThisYear = Math.max(0, rentThisYear - freeThisYear);
        remainingFree -= Math.min(remainingFree, 12);
      }

      annualRents.push(rentThisYear);
      totalLease += rentThisYear;
    }

    // Commission
    let totalCommission = 0;
    let yearCommissions: number[] = [];

    if (commissionType === 'per-sf') {
      totalCommission = sqft * perSfRate;
      const perYear = totalCommission / years;
      yearCommissions = Array(years).fill(perYear);
    } else if (commissionType === 'flat') {
      const rate = flatRate / 100;
      yearCommissions = annualRents.map(r => r * rate);
      totalCommission = yearCommissions.reduce((a, b) => a + b, 0);
    } else {
      yearCommissions = annualRents.map((rent, idx) => {
        const yearNum = idx + 1;
        let rate = 0;
        for (let t of tiers) {
          if (yearNum >= t.from && (t.to === 0 || yearNum <= t.to)) {
            rate = t.rate / 100;
            break;
          }
        }
        return rent * (rate || 0);
      });
      totalCommission = yearCommissions.reduce((a, b) => a + b, 0);
    }

    // Co-broker takes their share from total commission
    const coBrokerPayout = totalCommission * (coBrokerSplit / 100);
    
    // What I actually receive (my net)
    const myNetPayout = totalCommission - coBrokerPayout;

    // Split MY NET PAYOUT into two tranches
    let firstHalfAmount = myNetPayout;
    let secondHalfAmount = 0;

    if (splitPayments && myNetPayout > 0) {
      firstHalfAmount = myNetPayout * (firstHalfPercent / 100);
      secondHalfAmount = myNetPayout - firstHalfAmount;
    }

    const newResults = {
      totalLease,
      totalCommission,
      coBrokerPayout,
      yourNet: myNetPayout,
      annualRents,
      yearCommissions,
      splitPayments,
      firstHalfAmount,
      secondHalfAmount,
      firstHalfDate: leaseExecutionDate,
      secondHalfDate: calculatedRentCommencementDate,
    };

    setResults(newResults);
    setLastCalculation(newResults);
  };

  // ==================== PDF EXPORT ====================
  const exportPDF = () => {
    if (!lastCalculation) {
      alert("Please calculate a deal first.");
      return;
    }

    const doc = new jsPDF();
    const calc = lastCalculation;
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 25;

    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.text("LeaseCalc", 15, 14);
    doc.setFontSize(11);
    doc.text("Commercial Lease Commission Report", pageWidth - 15, 14, { align: 'right' });

    y = 35;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text(dealName || "Untitled Deal", 15, y);
    doc.setFontSize(10);
    doc.text(new Date().toLocaleDateString(), pageWidth - 15, y, { align: 'right' });

    y += 15;
    doc.setFontSize(12);
    doc.text("Key Results", 15, y);
    y += 10;

    const metrics = [
      ["Total Lease Value", formatCurrency(calc.totalLease)],
      ["Total Commission", formatCurrency(calc.totalCommission)],
      ["Co-Broker Payout", formatCurrency(calc.coBrokerPayout || 0)],
      ["Your Net Payout", formatCurrency(calc.yourNet)],
    ];

    doc.setFontSize(11);
    metrics.forEach(([label, value]) => {
      doc.text(label + ":", 20, y);
      doc.text(value, 95, y);
      y += 8;
    });

    if (calc.splitPayments) {
      y += 10;
      doc.setFontSize(12);
      doc.text("Commission Payment Schedule (Your Net)", 15, y);
      y += 10;
      doc.setFontSize(10);
      doc.text(`1st Half: ${formatCurrency(calc.firstHalfAmount)} on ${formatDate(calc.firstHalfDate)}`, 20, y);
      y += 7;
      doc.text(`2nd Half: ${formatCurrency(calc.secondHalfAmount)} on ${formatDate(calc.secondHalfDate)}`, 20, y);
    }

    if (notes) {
      y += 10;
      doc.text("Notes:", 15, y);
      y += 7;
      doc.setFontSize(10);
      const noteLines = doc.splitTextToSize(notes, pageWidth - 40);
      doc.text(noteLines, 20, y);
    }

    doc.save(`${dealName || 'LeaseCalc_Deal'}.pdf`);
  };

  // ==================== SAVE / LOAD ====================
  const saveDeal = () => {
    if (!lastCalculation) return alert("Calculate a deal first!");
    const name = prompt("Deal name?", dealName || "New Deal");
    if (!name) return;

    const deal = {
      id: Date.now(),
      name: name.trim(),
      dealName: dealName.trim(),
      date: new Date().toISOString().split('T')[0],
      sqft, rentQuotedAs, rentAmount, years, includeFreeRent, freeMonths, extraMonths,
      rentStructure, annualEscalation, escalationType, escalationFrequency, flatYears, stepFrequency,
      commissionType, flatRate, perSfRate, tiers,
      coBrokerSplit,
      notes: notes.trim(),
      splitPayments,
      leaseExecutionDate,
      firstHalfPercent,
      daysToRentCommencement,
      ...lastCalculation
    };

    const updated = [deal, ...savedDeals];
    setSavedDeals(updated);
    localStorage.setItem('leaseDeals', JSON.stringify(updated));
    alert(`✅ "${name}" saved!`);
  };

  const loadDeal = (deal: any) => {
    setDealName(deal.dealName || '');
    setSqft(deal.sqft || 0);
    setRentQuotedAs(deal.rentQuotedAs || 'sf');
    setRentAmount(deal.rentAmount || 0);
    setYears(deal.years || 5);
    setIncludeFreeRent(!!deal.includeFreeRent);
    setFreeMonths(deal.freeMonths || 2);
    setExtraMonths(deal.extraMonths || 0);
    setRentStructure(deal.rentStructure || 'annual');
    setAnnualEscalation(deal.annualEscalation || 3);
    setEscalationType(deal.escalationType || 'percent');
    setEscalationFrequency(deal.escalationFrequency || 3);
    setFlatYears(deal.flatYears || 3);
    setStepFrequency(deal.stepFrequency || 3);
    setCommissionType(deal.commissionType || 'flat');
    setFlatRate(deal.flatRate || 3);
    setPerSfRate(deal.perSfRate || 8.5);
    setTiers(deal.tiers || [{ from: 1, to: 5, rate: 6 }]);
    setCoBrokerSplit(deal.coBrokerSplit || 0);
    setNotes(deal.notes || '');

    setSplitPayments(deal.splitPayments !== false);
    setLeaseExecutionDate(deal.leaseExecutionDate || '');
    setFirstHalfPercent(deal.firstHalfPercent || 50);
    setDaysToRentCommencement(deal.daysToRentCommencement || 90);

    setResults({
      totalLease: deal.totalLease,
      totalCommission: deal.totalCommission,
      coBrokerPayout: deal.coBrokerPayout || 0,
      yourNet: deal.yourNet,
      annualRents: deal.annualRents,
      yearCommissions: deal.yearCommissions,
      splitPayments: deal.splitPayments !== false,
      firstHalfAmount: deal.firstHalfAmount,
      secondHalfAmount: deal.secondHalfAmount,
      firstHalfDate: deal.firstHalfDate,
      secondHalfDate: deal.secondHalfDate,
    });

    setActiveTab('calculator');
  };

  const editDeal = (id: number) => {
    const dealIndex = savedDeals.findIndex((d) => d.id === id);
    if (dealIndex === -1) return;
    const currentName = savedDeals[dealIndex].name;
    const newName = prompt("Edit deal name:", currentName);
    if (!newName) return;
    const trimmed = newName.trim();
    if (trimmed === "" || trimmed === currentName) return;
    const updated = [...savedDeals];
    updated[dealIndex] = { ...updated[dealIndex], name: trimmed };
    setSavedDeals(updated);
    localStorage.setItem('leaseDeals', JSON.stringify(updated));
  };

  const deleteDeal = (id: number) => {
    if (!confirm("Delete this saved deal?")) return;
    const updated = savedDeals.filter((deal) => deal.id !== id);
    setSavedDeals(updated);
    localStorage.setItem('leaseDeals', JSON.stringify(updated));
  };

  const filteredDeals = savedDeals.filter(deal =>
    deal.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const addTier = () => {
    setTiers([...tiers, { from: tiers[tiers.length - 1]?.to + 1 || 1, to: 0, rate: 6 }]);
  };

  const removeTier = (index: number) => {
    if (tiers.length === 1) return;
    setTiers(tiers.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl">LC</div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">LeaseCalc</h1>
              <p className="text-blue-600 text-sm">Commercial Lease Commission Calculator</p>
            </div>
          </div>

          <div className="flex items-center gap-x-4">
            <button onClick={saveDeal} className="flex items-center gap-x-2 px-5 py-2.5 bg-white border border-slate-300 rounded-2xl text-sm font-medium hover:bg-slate-50">
              <Save className="w-4 h-4" /> Save Deal
            </button>
            <button onClick={exportPDF} className="flex items-center gap-x-2 px-5 py-2.5 bg-blue-600 text-white rounded-2xl text-sm font-medium hover:bg-blue-700">
              <Download className="w-4 h-4" /> Export PDF
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 mb-6">
          <button onClick={() => setActiveTab('calculator')} className={`px-6 py-3 font-medium text-sm transition-colors ${activeTab === 'calculator' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>Calculator</button>
          <button onClick={() => setActiveTab('saved')} className={`px-6 py-3 font-medium text-sm transition-colors flex items-center gap-x-2 ${activeTab === 'saved' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
            Saved Deals {savedDeals.length > 0 && <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full">{savedDeals.length}</span>}
          </button>
        </div>

        {/* CALCULATOR TAB */}
        {activeTab === 'calculator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-12 bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
              <h2 className="text-2xl font-semibold mb-6 flex items-center gap-x-2">
                <Building2 className="w-6 h-6 text-blue-600" /> Deal Details
              </h2>

              {/* Deal Name */}
              <div className="mb-6">
                <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Deal / Property Name</label>
                <input type="text" value={dealName} onChange={(e) => setDealName(e.target.value)} placeholder="e.g. Raleigh Retail Plaza - Unit 104" className="w-full h-14 bg-slate-50 border border-slate-300 rounded-2xl px-5 text-lg focus:outline-none focus:border-blue-500" />
              </div>

              {/* Square Footage + Rent Type + Amount */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Square Footage</label>
                  <div className="flex gap-x-3 items-center">
                    <input type="number" value={sqft} onChange={(e) => setSqft(Number(e.target.value))} className="flex-1 h-14 bg-slate-50 border border-slate-300 rounded-2xl px-5 text-lg focus:outline-none focus:border-blue-500" />
                    <span className="text-slate-400 text-lg">sq ft</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Rent Quoted As</label>
                  <select value={rentQuotedAs} onChange={(e) => setRentQuotedAs(e.target.value as any)} className="w-full h-14 bg-slate-50 border border-slate-300 rounded-2xl px-5 text-lg focus:outline-none focus:border-blue-500">
                    <option value="sf">$/SF/Year</option>
                    <option value="annual">Annual Quoted Rent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">{rentQuotedAs === 'sf' ? '$/SF/Year' : 'Annual Quoted Rent'}</label>
                  <div className="flex gap-x-3 items-center">
                    <span className="text-3xl text-slate-400">$</span>
                    <input type="number" value={rentAmount} onChange={(e) => setRentAmount(Number(e.target.value))} className="flex-1 h-14 bg-slate-50 border border-slate-300 rounded-2xl px-5 text-2xl font-medium focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
              </div>

              {/* Lease Term + Free Rent */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6">
                <div>
                  <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Lease Term (Years)</label>
                  <input type="number" value={years} onChange={(e) => setYears(Number(e.target.value))} className="w-full h-14 bg-slate-50 border border-slate-300 rounded-2xl px-5 text-lg focus:outline-none focus:border-blue-500" />
                </div>
                <div className="flex items-center gap-x-3 pt-8">
                  <input type="checkbox" checked={includeFreeRent} onChange={(e) => setIncludeFreeRent(e.target.checked)} className="w-5 h-5 accent-blue-600" />
                  <label className="text-slate-700 font-medium">Include Free Rent</label>
                </div>
              </div>

              {includeFreeRent && (
                <div className="mt-6 grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Free Rent Months</label>
                    <input type="number" value={freeMonths} onChange={(e) => setFreeMonths(Number(e.target.value))} className="w-full h-14 bg-slate-50 border border-slate-300 rounded-2xl px-5 text-lg focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Extra Months</label>
                    <input type="number" value={extraMonths} onChange={(e) => setExtraMonths(Number(e.target.value))} className="w-full h-14 bg-slate-50 border border-slate-300 rounded-2xl px-5 text-lg focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
              )}

              {/* Rent Structure */}
              <div className="mt-8 pt-6 border-t border-slate-200">
                <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Rent Structure</label>
                <select value={rentStructure} onChange={(e) => setRentStructure(e.target.value as any)} className="w-full h-14 bg-slate-50 border border-slate-300 rounded-2xl px-5 text-lg focus:outline-none focus:border-blue-500">
                  <option value="annual">Annual Escalations</option>
                  <option value="flat">Flat Rent</option>
                  <option value="every-n">Escalations Every N Years</option>
                  <option value="flat-step">Flat Period + Step-Ups</option>
                </select>

                <div className="mt-5 min-h-[140px]">
                  {rentStructure === 'annual' && (
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Escalation</label>
                      <div className="flex">
                        <input type="number" value={annualEscalation} onChange={(e) => setAnnualEscalation(Number(e.target.value))} className="flex-1 h-14 bg-slate-50 border border-slate-300 rounded-l-2xl px-5 text-lg focus:outline-none focus:border-blue-500" />
                        <select value={escalationType} onChange={(e) => setEscalationType(e.target.value as any)} className="h-14 bg-slate-100 border border-l-0 border-slate-300 rounded-r-2xl px-4 text-sm font-medium focus:outline-none">
                          <option value="percent">%</option>
                          <option value="dollar">$</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {rentStructure === 'every-n' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Escalation</label>
                        <div className="flex">
                          <input type="number" value={annualEscalation} onChange={(e) => setAnnualEscalation(Number(e.target.value))} className="flex-1 h-14 bg-slate-50 border border-slate-300 rounded-l-2xl px-5 text-lg focus:outline-none focus:border-blue-500" />
                          <select value={escalationType} onChange={(e) => setEscalationType(e.target.value as any)} className="h-14 bg-slate-100 border border-l-0 border-slate-300 rounded-r-2xl px-4 text-sm font-medium focus:outline-none">
                            <option value="percent">%</option>
                            <option value="dollar">$</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Every N Years</label>
                        <input type="number" value={escalationFrequency} onChange={(e) => setEscalationFrequency(Number(e.target.value))} className="w-full h-14 bg-slate-50 border border-slate-300 rounded-2xl px-5 text-lg focus:outline-none focus:border-blue-500" />
                      </div>
                    </div>
                  )}

                  {rentStructure === 'flat-step' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Flat for first</label>
                        <input type="number" value={flatYears} onChange={(e) => setFlatYears(Number(e.target.value))} className="w-full h-14 bg-slate-50 border border-slate-300 rounded-2xl px-5 text-lg focus:outline-none focus:border-blue-500" />
                        <span className="text-xs text-slate-400 mt-1 block">years</span>
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Then escalation</label>
                        <div className="flex">
                          <input type="number" value={annualEscalation} onChange={(e) => setAnnualEscalation(Number(e.target.value))} className="flex-1 h-14 bg-slate-50 border border-slate-300 rounded-l-2xl px-5 text-lg focus:outline-none focus:border-blue-500" />
                          <select value={escalationType} onChange={(e) => setEscalationType(e.target.value as any)} className="h-14 bg-slate-100 border border-l-0 border-slate-300 rounded-r-2xl px-4 text-sm font-medium focus:outline-none">
                            <option value="percent">%</option>
                            <option value="dollar">$</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Step every</label>
                        <input type="number" value={stepFrequency} onChange={(e) => setStepFrequency(Number(e.target.value))} className="w-full h-14 bg-slate-50 border border-slate-300 rounded-2xl px-5 text-lg focus:outline-none focus:border-blue-500" />
                        <span className="text-xs text-slate-400 mt-1 block">years</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Commission Details */}
              <div className="mt-8 pt-6 border-t border-slate-200">
                <h3 className="text-lg font-semibold mb-4">Commission Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Commission Structure</label>
                    <select value={commissionType} onChange={(e) => setCommissionType(e.target.value as any)} className="w-full h-14 bg-slate-50 border border-slate-300 rounded-2xl px-5 text-lg focus:outline-none focus:border-blue-500">
                      <option value="flat">Flat %</option>
                      <option value="tiered">Tiered % (by Year)</option>
                      <option value="per-sf">Per Square Foot ($/SF)</option>
                    </select>
                  </div>

                  {commissionType === 'flat' && (
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Commission Rate</label>
                      <div className="flex items-center gap-x-3">
                        <input type="number" value={flatRate} onChange={(e) => setFlatRate(Number(e.target.value))} className="w-28 h-14 bg-slate-50 border border-slate-300 rounded-2xl px-5 text-2xl font-medium text-center focus:outline-none focus:border-blue-500" />
                        <span className="text-2xl text-slate-400">%</span>
                      </div>
                    </div>
                  )}

                  {commissionType === 'per-sf' && (
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Commission per Square Foot</label>
                      <div className="flex items-center gap-x-3">
                        <span className="text-2xl text-slate-400">$</span>
                        <input type="number" value={perSfRate} onChange={(e) => setPerSfRate(Number(e.target.value))} step="0.01" className="w-28 h-14 bg-slate-50 border border-slate-300 rounded-2xl px-5 text-2xl font-medium text-center focus:outline-none focus:border-blue-500" />
                        <span className="text-slate-400">/ SF</span>
                      </div>
                    </div>
                  )}
                </div>

                {commissionType === 'tiered' && (
                  <div className="mt-6">
                    <div className="flex justify-between items-center mb-3">
                      <label className="text-sm font-medium">Tiers (by Year)</label>
                      <button onClick={addTier} className="flex items-center gap-x-1 text-blue-600 hover:text-blue-700 text-sm font-medium">
                        <Plus className="w-4 h-4" /> Add Tier
                      </button>
                    </div>
                    <div className="space-y-4">
                      {tiers.map((tier, index) => (
                        <div key={index} className="flex gap-4 items-end bg-slate-50 p-4 rounded-2xl">
                          <div className="flex-1"><label className="block text-xs text-slate-500 mb-1">From Year</label><input type="number" value={tier.from} onChange={(e) => { const nt = [...tiers]; nt[index].from = Number(e.target.value); setTiers(nt); }} className="w-full h-14 bg-white border border-slate-300 rounded-2xl px-4 text-lg focus:outline-none focus:border-blue-500" /></div>
                          <div className="flex-1"><label className="block text-xs text-slate-500 mb-1">To Year</label><input type="number" value={tier.to} onChange={(e) => { const nt = [...tiers]; nt[index].to = Number(e.target.value); setTiers(nt); }} className="w-full h-14 bg-white border border-slate-300 rounded-2xl px-4 text-lg focus:outline-none focus:border-blue-500" /></div>
                          <div className="w-28"><label className="block text-xs text-slate-500 mb-1">Rate %</label><input type="number" value={tier.rate} onChange={(e) => { const nt = [...tiers]; nt[index].rate = Number(e.target.value); setTiers(nt); }} className="w-full h-14 bg-white border border-slate-300 rounded-2xl px-4 text-lg focus:outline-none focus:border-blue-500" /></div>
                          <button onClick={() => removeTier(index)} className="text-red-500 hover:text-red-600"><Trash2 className="w-5 h-5" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Broker Splits */}
              <div className="mt-8 pt-8 border-t border-slate-200">
                <label className="block text-xs uppercase tracking-widest text-slate-500 mb-4">Broker Splits</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                    <div className="text-sm font-medium mb-1">Co-Broker Share</div>
                    <div className="flex items-center gap-x-2">
                      <input type="number" value={coBrokerSplit} onChange={(e) => setCoBrokerSplit(Number(e.target.value))} className="w-20 h-14 text-center bg-white border border-slate-300 rounded-2xl px-4 text-lg focus:outline-none focus:border-blue-500" />%
                    </div>
                  </div>
                </div>
              </div>

              {/* Commission Payment Schedule */}
              <div className="mt-8 pt-8 border-t border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-xs uppercase tracking-widest text-slate-500">Commission Payment Schedule</label>
                  <div className="flex items-center gap-x-2">
                    <input type="checkbox" checked={splitPayments} onChange={(e) => setSplitPayments(e.target.checked)} className="w-5 h-5 accent-blue-600" />
                    <span className="text-sm text-slate-600">Split into two payments</span>
                  </div>
                </div>

                {splitPayments && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 border border-slate-200 rounded-2xl p-6">
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Lease Execution Date</label>
                      <input type="date" value={leaseExecutionDate} onChange={(e) => setLeaseExecutionDate(e.target.value)} className="w-full h-14 bg-white border border-slate-300 rounded-2xl px-5 text-lg focus:outline-none focus:border-blue-500" />
                    </div>

                    <div>
                      <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">1st Half Payment % (of your net)</label>
                      <div className="flex items-center gap-x-3">
                        <input type="number" value={firstHalfPercent} onChange={(e) => setFirstHalfPercent(Number(e.target.value))} className="w-28 h-14 bg-white border border-slate-300 rounded-2xl px-5 text-lg text-center focus:outline-none focus:border-blue-500" />
                        <span className="text-lg text-slate-400">%</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Days Until Rent Commencement</label>
                      <input type="number" value={daysToRentCommencement} onChange={(e) => setDaysToRentCommencement(Number(e.target.value))} className="w-full h-14 bg-white border border-slate-300 rounded-2xl px-5 text-lg focus:outline-none focus:border-blue-500" />
                    </div>

                    <div>
                      <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Calculated Rent Commencement Date</label>
                      <div className="h-14 flex items-center px-5 bg-white border border-slate-300 rounded-2xl text-lg text-slate-700">
                        {calculatedRentCommencementDate ? formatDate(calculatedRentCommencementDate) : '—'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes Field */}
              <div className="mt-8 pt-8 border-t border-slate-200">
                <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">Notes / Comments</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this deal..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-blue-500 min-h-[100px] resize-y"
                />
              </div>

              <button onClick={calculate} className="mt-8 w-full lg:w-auto bg-blue-600 hover:bg-blue-700 text-white px-10 py-4 rounded-2xl font-semibold flex items-center justify-center gap-x-2 text-lg">
                <Calculator className="w-5 h-5" /> CALCULATE NOW
              </button>
            </div>

            {/* Results Section */}
            {results && (
              <div className="lg:col-span-12 bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
                <h2 className="text-2xl font-semibold mb-6">Calculation Results</h2>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                  <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6"><p className="text-xs text-slate-500">TOTAL LEASE VALUE</p><p className="text-3xl font-semibold mt-1">{formatCurrency(results.totalLease)}</p></div>
                  <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6"><p className="text-xs text-slate-500">TOTAL COMMISSION</p><p className="text-3xl font-semibold text-blue-600 mt-1">{formatCurrency(results.totalCommission)}</p></div>
                  <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6"><p className="text-xs text-slate-500">CO-BROKER PAYOUT</p><p className="text-3xl font-semibold text-amber-600 mt-1">{formatCurrency(results.coBrokerPayout || 0)}</p></div>
                  <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6"><p className="text-xs text-slate-500">YOUR NET PAYOUT</p><p className="text-3xl font-semibold text-emerald-600 mt-1">{formatCurrency(results.yourNet)}</p></div>
                </div>

                {/* Payment Schedule - Now based on Your Net */}
                {results.splitPayments && (
                  <div className="mb-8">
                    <h3 className="text-sm font-semibold text-slate-600 mb-3">COMMISSION PAYMENT SCHEDULE (Your Net)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white border border-slate-200 rounded-2xl p-5">
                        <div className="text-xs text-slate-500 mb-1">1ST HALF PAYMENT</div>
                        <div className="text-2xl font-semibold text-blue-600 mb-1">{formatCurrency(results.firstHalfAmount)}</div>
                        <div className="text-sm text-slate-600">{formatDate(results.firstHalfDate) || 'Lease Execution Date'}</div>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-2xl p-5">
                        <div className="text-xs text-slate-500 mb-1">2ND HALF PAYMENT</div>
                        <div className="text-2xl font-semibold text-blue-600 mb-1">{formatCurrency(results.secondHalfAmount)}</div>
                        <div className="text-sm text-slate-600">{formatDate(results.secondHalfDate) || 'Rent Commencement Date'}</div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-2 text-center">These two payments equal your net payout after co-broker share.</p>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-medium text-slate-500 mb-3">YEAR-BY-YEAR BREAKDOWN</h3>
                  <div className="overflow-auto max-h-80 rounded-3xl border border-slate-200 bg-white">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-4 px-6 font-medium text-slate-500">Year</th>
                          <th className="text-right py-4 px-6 font-medium text-slate-500">Annual Rent</th>
                          <th className="text-right py-4 px-6 font-medium text-slate-500">Rent $/SF</th>
                          <th className="text-right py-4 px-6 font-medium text-slate-500">Commission</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {results.annualRents.map((rent: number, i: number) => {
                          const psf = sqft > 0 ? rent / sqft : 0;
                          return (
                            <tr key={i}>
                              <td className="py-4 px-6">{i + 1}</td>
                              <td className="py-4 px-6 text-right">{formatCurrency(rent)}</td>
                              <td className="py-4 px-6 text-right">{psf.toFixed(2)}</td>
                              <td className="py-4 px-6 text-right text-blue-600">{formatCurrency(results.yearCommissions[i] || 0)}</td>
                            </tr>
                          );
                        })}

                        <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                          <td className="py-3.5 px-6">TOTAL</td>
                          <td className="py-3.5 px-6 text-right font-mono">{formatCurrency(results.totalLease)}</td>
                          <td className="py-3.5 px-6 text-right"></td>
                          <td className="py-3.5 px-6 text-right font-mono text-blue-700">{formatCurrency(results.totalCommission)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SAVED DEALS TAB */}
        {activeTab === 'saved' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold">Saved Deals</h2>
              <div className="w-72">
                <input type="text" placeholder="Search deals..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-white border border-slate-300 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>

            {filteredDeals.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center"><p className="text-slate-500">No saved deals found.</p></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {filteredDeals.map((deal) => (
                  <div key={deal.id} className="bg-white border border-slate-200 rounded-3xl p-5 hover:border-blue-300 transition-colors relative group cursor-pointer" onClick={() => loadDeal(deal)}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{deal.name}</p>
                        <p className="text-xs text-slate-500">{formattedDates[deal.id] || new Date(deal.date).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right pr-14">
                        <p className="text-blue-600 text-xl font-medium">{formatCurrency(deal.yourNet)}</p>
                        <p className="text-xs text-slate-500">your net</p>
                      </div>
                    </div>
                    <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={(e) => { e.stopPropagation(); editDeal(deal.id); }} className="p-1.5 rounded-lg bg-white border border-slate-200 text-blue-500 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 shadow-sm"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); deleteDeal(deal.id); }} className="p-1.5 rounded-lg bg-white border border-slate-200 text-red-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 shadow-sm"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}