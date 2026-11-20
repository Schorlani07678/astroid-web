'use client';

import Link from 'next/link';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { QueryBoundary } from '@/components/dashboard/query-boundary';
import { SectionLabel } from '@/components/dashboard/stat-card';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SkeletonCard } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { PolicyShieldIllustration } from '@/components/illustrations';
import { usePolicies } from '@/hooks/use-queries';
import { formatNumber } from '@/lib/format';
import { PageTransition } from '@/components/ui/motion';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PolicyRulesBuilder } from '@/features/policies/PolicyRulesBuilder';
import { BudgetSimulator } from '@/features/policies/BudgetSimulator';
import { PolicySandboxWidget } from '@/features/policies/PolicySandboxWidget';
import { PolicySimulationPanel } from '@/features/policies/PolicySimulationPanel';
import { SpendingPolicyBuilder } from '@/features/policies/SpendingPolicyBuilder';
import { TransactionSimulator } from '@/features/policies/TransactionSimulator';

const titleCase = (value: string): string =>
  value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');

export default function PoliciesPage() {
  const policies = usePolicies();

  return (
    <PageTransition className="space-y-8">
      <PageHeader
        eyebrow="Govern"
        title="Policies"
        description="The guardrails every agent operates within — spend ceilings, allow-lists, approval rules and locks."
      />

      <ErrorBoundary section="Budget simulator">
        <BudgetSimulator />
      </ErrorBoundary>

      <div className="space-y-4">
        <SectionLabel>Policy rule simulation modal</SectionLabel>
        <ErrorBoundary section="Transaction simulator">
          <TransactionSimulator />
        </ErrorBoundary>
      </div>

      <QueryBoundary
        query={policies}
        loading={
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        }
        isEmpty={(data) => data.length === 0}
        empty={
          <EmptyState
            illustration={<PolicyShieldIllustration />}
            title="No policies yet"
            description="Define your first policy to start governing how agents can move value."
          />
        }
      >
        {(data) => (
          <div className="space-y-6">
            <ErrorBoundary section="Policy simulation">
              <PolicySimulationPanel policies={data} />
            </ErrorBoundary>
            <ErrorBoundary section="Policy sandbox">
              <PolicySandboxWidget policies={data} />
            </ErrorBoundary>

            <SectionLabel>Spending policy studio</SectionLabel>
            <ErrorBoundary section="Spending policy studio">
              <SpendingPolicyBuilder />
            </ErrorBoundary>

            <SectionLabel>Spending rule designer</SectionLabel>
            <ErrorBoundary section="Spending rule designer">
              <PolicyRulesBuilder />
            </ErrorBoundary>

            <SectionLabel>{data.length} policies</SectionLabel>
            <div className="grid gap-4 lg:grid-cols-2">
              {data.map((policy) => (
                <Link key={policy.id} href={`/policies/${policy.id}`} className="block">
                  <Card interactive className="h-full">
                    <CardContent className="space-y-3 pt-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">{policy.name}</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" size="sm">
                              {titleCase(policy.type)}
                            </Badge>
                            <Badge variant="neutral" size="sm">
                              Priority {policy.priority}
                            </Badge>
                          </div>
                        </div>
                        <Badge
                          variant={policy.enabled ? 'success' : 'neutral'}
                          size="sm"
                          dot
                        >
                          {policy.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <p className="text-xs leading-relaxed text-foreground-secondary">
                        {policy.description}
                      </p>
                    </CardContent>
                    <CardFooter className="justify-between">
                      <span className="inline-flex items-center gap-1.5 text-2xs text-foreground-secondary">
                        <ShieldCheck className="h-3.5 w-3.5 text-gold" aria-hidden />
                        Applies to {formatNumber(policy.appliesTo)}{' '}
                        {policy.appliesTo === 1 ? 'agent' : 'agents'}
                      </span>
                      {policy.violations30d > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-2xs font-medium text-warning">
                          <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
                          {formatNumber(policy.violations30d)} violations · 30d
                        </span>
                      ) : (
                        <span className="text-2xs text-foreground-muted">
                          No violations · 30d
                        </span>
                      )}
                    </CardFooter>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </QueryBoundary>
    </PageTransition>
  );
}
