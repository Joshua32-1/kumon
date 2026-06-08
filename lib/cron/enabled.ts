import { supabaseAdmin } from "@/lib/supabase/admin"
import {
  CRON_JOBS_CONFIG_KEY,
  parseCronJobsConfig,
  type CronJobId,
} from "@/lib/cron/jobs"

export async function isCronJobEnabled(jobId: CronJobId): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("system_config")
    .select("value")
    .eq("key", CRON_JOBS_CONFIG_KEY)
    .maybeSingle()

  const config = parseCronJobsConfig(data?.value)
  return config[jobId].enabled
}
