import React, { useEffect, useState } from 'react';
import {
    BarChart3,
    TrendingUp,
    History,
    Target,
    PieChart as PieChartIcon,
    Activity,
    Clock,
    Timer,
    ChevronRight,
    Flame,
    BookOpen,
    Zap,
    Award,
    Brain
} from 'lucide-react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
    Filler
} from 'chart.js';
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';
import Card from '../components/ui/Card';
import api from '../services/api';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

/**
 * Analytics Page Component.
 * 
 * Aggregates and visualizes learning statistics using Chart.js.
 * Displays performance trends over time, SRS stage distribution, 
 * recall quality, and per-document reading metrics.
 * 
 * @returns {JSX.Element} The rendered analytics dashboard.
 */
const Analytics = () => {
    const [performance, setPerformance] = useState([]);
    const [retention, setRetention] = useState(null);
    const [overview, setOverview] = useState(null);
    const [timeStats, setTimeStats] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [perfData, retData, overData, timeData] = await Promise.all([
                    api.get('/analytics/performance'),
                    api.get('/analytics/retention'),
                    api.get('/analytics/overview'),
                    api.get('/analytics/time-tracking')
                ]);
                setPerformance(perfData);
                setRetention(retData);
                setOverview(overData);
                setTimeStats(timeData);
            } catch (err) {
                console.error('Failed to fetch analytics', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, []);

    /**
     * Data configuration for the Activity Trends line chart.
     */
    const lineChartData = {
        labels: performance.map(p => new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
        datasets: [
            {
                label: 'Cards Reviewed',
                data: performance.map(p => p.cards_reviewed),
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#8b5cf6',
                pointBorderColor: '#1a1a2e',
                pointBorderWidth: 2,
            },
            {
                label: 'New Cards',
                data: performance.map(p => p.new_cards),
                borderColor: '#06b6d4',
                backgroundColor: 'rgba(6, 182, 212, 0.05)',
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#06b6d4',
                pointBorderColor: '#1a1a2e',
                pointBorderWidth: 2,
            }
        ],
    };

    /**
     * Standard shared configuration for Cartesian charts.
     */
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: {
                    color: '#94a3b8',
                    font: { family: 'Inter', weight: '600', size: 11 },
                    usePointStyle: true,
                    pointStyle: 'circle',
                    padding: 20
                }
            },
            tooltip: {
                padding: 16,
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                titleFont: { family: 'Inter', size: 14, weight: '600' },
                bodyFont: { family: 'Inter', size: 13 },
                borderColor: 'rgba(139, 92, 246, 0.3)',
                borderWidth: 1,
                cornerRadius: 12,
                displayColors: true,
                boxPadding: 6
            }
        },
        scales: {
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.03)' },
                ticks: { color: '#64748b', font: { size: 11 } },
                border: { display: false }
            },
            x: {
                grid: { display: false },
                ticks: { color: '#64748b', font: { size: 11 } },
                border: { display: false }
            }
        }
    };

    /**
     * Data configuration for the Recall Quality pie chart.
     */
    const pieData = {
        labels: ['Forgot (0-1)', 'Difficult (2-3)', 'Good (4)', 'Perfect (5)'],
        datasets: [
            {
                data: retention?.rating_distribution ? [
                    (retention.rating_distribution['0'] || 0) + (retention.rating_distribution['1'] || 0),
                    (retention.rating_distribution['2'] || 0) + (retention.rating_distribution['3'] || 0),
                    (retention.rating_distribution['4'] || 0),
                    (retention.rating_distribution['5'] || 0)
                ] : [1, 1, 1, 1],
                backgroundColor: [
                    'rgba(239, 68, 68, 0.85)',
                    'rgba(245, 158, 11, 0.85)',
                    'rgba(59, 130, 246, 0.85)',
                    'rgba(16, 185, 129, 0.85)',
                ],
                borderWidth: 0,
                hoverOffset: 8
            },
        ],
    };

    /**
     * Data configuration for the SRS Stage Distribution doughnut chart.
     */
    const srsDistribution = overview?.srs_distribution || { new: 0, learning: 0, mastered: 0 };
    const srsData = {
        labels: ['New', 'Learning', 'Mastered'],
        datasets: [{
            data: [srsDistribution.new, srsDistribution.learning, srsDistribution.mastered],
            backgroundColor: [
                'rgba(99, 102, 241, 0.85)',
                'rgba(245, 158, 11, 0.85)',
                'rgba(16, 185, 129, 0.85)',
            ],
            borderWidth: 0,
            hoverOffset: 6
        }]
    };

    /**
     * Shared configuration for radial/doughnut charts.
     */
    const doughnutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
            legend: {
                display: true,
                position: 'bottom',
                labels: {
                    color: '#94a3b8',
                    font: { family: 'Inter', size: 11, weight: '500' },
                    usePointStyle: true,
                    pointStyle: 'circle',
                    padding: 16
                }
            },
            tooltip: {
                padding: 12,
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                cornerRadius: 8
            }
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="relative">
                    <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary-500/20 border-t-primary-500"></div>
                    <Brain className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-primary-400" />
                </div>
            </div>
        );
    }

    /**
     * Internal UI component for displaying individual dashboard markers.
     */
    const StatCard = ({ icon: Icon, title, value, subtitle, gradient, iconColor }) => (
        <div className={`relative overflow-hidden rounded-2xl border border-white/5 p-6 transition-all duration-300 hover:scale-[1.02] hover:border-white/10 group ${gradient}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${iconColor} bg-white/5 border border-white/10`}>
                    <Icon className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-dark-500 uppercase tracking-widest mb-1">{title}</p>
                <h4 className="text-3xl font-extrabold text-white mb-1">{value}</h4>
                {subtitle && <p className="text-xs text-dark-400">{subtitle}</p>}
            </div>
        </div>
    );

    return (
        <div className="space-y-8 animate-fade-in">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-dark-300 bg-clip-text text-transparent">
                        Analytics & Insights
                    </h1>
                    <p className="text-dark-400 mt-1">Track your memory performance and learning progress.</p>
                </div>
                {/* Visual Marker: Streak Badge */}
                {overview?.study_streak > 0 && (
                    <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/30">
                        <Flame className="w-5 h-5 text-orange-400 animate-pulse" />
                        <div>
                            <p className="text-xs font-bold text-orange-400 uppercase tracking-wider">Streak</p>
                            <p className="text-xl font-extrabold text-white">{overview.study_streak} days</p>
                        </div>
                    </div>
                )}
            </header>

            {/* Performance Overview: KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    icon={BookOpen}
                    title="Total Cards"
                    value={overview?.total_flashcards || 0}
                    subtitle={`${overview?.cards_due_today || 0} due today`}
                    gradient="bg-gradient-to-br from-indigo-500/10 to-violet-500/5"
                    iconColor="text-indigo-400"
                />
                <StatCard
                    icon={Target}
                    title="Retention"
                    value={`${(overview?.retention_rate || 0).toFixed(0)}%`}
                    subtitle="Success rate"
                    gradient="bg-gradient-to-br from-emerald-500/10 to-teal-500/5"
                    iconColor="text-emerald-400"
                />
                <StatCard
                    icon={Zap}
                    title="Reviews"
                    value={retention?.total_reviews || 0}
                    subtitle="All-time reviews"
                    gradient="bg-gradient-to-br from-amber-500/10 to-orange-500/5"
                    iconColor="text-amber-400"
                />
                <StatCard
                    icon={Clock}
                    title="Time Spent"
                    value={`${Math.round((overview?.total_time_spent || 0) / 3600)}h`}
                    subtitle={`${Math.round(((overview?.total_time_spent || 0) % 3600) / 60)}m total`}
                    gradient="bg-gradient-to-br from-cyan-500/10 to-blue-500/5"
                    iconColor="text-cyan-400"
                />
            </div>

            {/* Insight Visualization: Trends and Stages */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Trend Analysis Chart */}
                <Card className="lg:col-span-2 !p-0 overflow-hidden">
                    <div className="p-6 border-b border-white/5">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-white">Activity Trends</h3>
                                <p className="text-xs text-dark-500">Daily review volume over time</p>
                            </div>
                            <Activity className="w-5 h-5 text-dark-500" />
                        </div>
                    </div>
                    <div className="h-[350px] p-6">
                        {performance.length > 0 ? (
                            <Line data={lineChartData} options={chartOptions} />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-dark-600 border-2 border-dashed border-white/5 rounded-2xl">
                                <Activity className="w-12 h-12 mb-3 opacity-20" />
                                <p className="font-medium">No data yet</p>
                                <p className="text-sm text-dark-500">Complete some reviews to see trends</p>
                            </div>
                        )}
                    </div>
                </Card>

                {/* Lifecycle Analysis Chart */}
                <Card className="!p-0 overflow-hidden">
                    <div className="p-6 border-b border-white/5">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-white">Card Mastery</h3>
                                <p className="text-xs text-dark-500">SRS stage distribution</p>
                            </div>
                            <Award className="w-5 h-5 text-dark-500" />
                        </div>
                    </div>
                    <div className="h-[280px] p-6 flex items-center justify-center">
                        {(srsDistribution.new + srsDistribution.learning + srsDistribution.mastered) > 0 ? (
                            <Doughnut data={srsData} options={doughnutOptions} />
                        ) : (
                            <div className="text-center text-dark-600">
                                <Brain className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p className="font-medium">No cards yet</p>
                                <p className="text-sm text-dark-500">Create flashcards to track mastery</p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            {/* Quality and Progress Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Reliability Assessment Chart */}
                <Card className="!p-0 overflow-hidden">
                    <div className="p-6 border-b border-white/5">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-white">Recall Quality</h3>
                                <p className="text-xs text-dark-500">Answer rating distribution</p>
                            </div>
                            <PieChartIcon className="w-5 h-5 text-dark-500" />
                        </div>
                    </div>
                    <div className="p-6">
                        <div className="h-[250px] flex items-center justify-center">
                            {retention?.total_reviews > 0 ? (
                                <Pie data={pieData} options={{
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: {
                                            position: 'right',
                                            labels: {
                                                color: '#94a3b8',
                                                font: { size: 11 },
                                                usePointStyle: true,
                                                padding: 12
                                            }
                                        }
                                    }
                                }} />
                            ) : (
                                <div className="text-center text-dark-600">
                                    <PieChartIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                    <p className="font-medium">No ratings yet</p>
                                    <p className="text-sm text-dark-500">Complete reviews to see quality metrics</p>
                                </div>
                            )}
                        </div>
                        {retention?.total_reviews > 0 && (
                            <div className="mt-6 pt-6 border-t border-white/5">
                                <div className="flex items-center justify-between text-sm mb-3">
                                    <span className="text-dark-400">Overall Retention</span>
                                    <span className="font-bold text-emerald-400">{retention?.retention_rate?.toFixed(1)}%</span>
                                </div>
                                <div className="w-full h-2 bg-dark-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                                        style={{ width: `${retention?.retention_rate || 0}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </Card>

                {/* Operational Progress Tracker */}
                <Card className="!p-0 overflow-hidden">
                    <div className="p-6 border-b border-white/5">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-white">Document Progress</h3>
                                <p className="text-xs text-dark-500">Time spent and completion</p>
                            </div>
                            <Timer className="w-5 h-5 text-dark-500" />
                        </div>
                    </div>
                    <div className="max-h-[350px] overflow-y-auto">
                        <table className="w-full text-left">
                            <thead className="sticky top-0 bg-dark-900/95 backdrop-blur-sm">
                                <tr className="border-b border-white/5">
                                    <th className="text-[10px] font-bold text-dark-500 uppercase tracking-widest px-6 py-4">Document</th>
                                    <th className="text-[10px] font-bold text-dark-500 uppercase tracking-widest px-4 py-4 text-center">Progress</th>
                                    <th className="text-[10px] font-bold text-dark-500 uppercase tracking-widest px-4 py-4 text-right">Time</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {timeStats.map((doc) => (
                                    <tr key={doc.id} className="group hover:bg-white/5 transition-colors cursor-pointer">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-primary-500/10 flex items-center justify-center">
                                                    <BookOpen className="w-4 h-4 text-primary-400" />
                                                </div>
                                                <span className="font-medium text-white text-sm truncate max-w-[150px]">{doc.title}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <div className="w-16 h-1.5 bg-dark-800 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-primary-500 to-violet-500 transition-all"
                                                        style={{ width: `${(doc.progress || 0) * 100}%` }}
                                                    />
                                                </div>
                                                <span className="text-[10px] font-bold text-primary-400 min-w-[35px]">
                                                    {Math.round((doc.progress || 0) * 100)}%
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <span className="text-xs text-dark-300 font-mono">
                                                {Math.round(doc.time_spent / 60)}m
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {timeStats.length === 0 && (
                                    <tr>
                                        <td colSpan="3" className="py-12 text-center">
                                            <BookOpen className="w-10 h-10 mx-auto mb-3 text-dark-600 opacity-50" />
                                            <p className="text-dark-500 text-sm font-medium">No documents tracked yet</p>
                                            <p className="text-dark-600 text-xs mt-1">Open a document to start tracking</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default Analytics;
