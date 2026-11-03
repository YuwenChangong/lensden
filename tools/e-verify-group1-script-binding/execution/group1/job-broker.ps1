# Internal fixed broker, not a caller-facing PID utility. No profile, network,
# provider, configuration changes, or caller-supplied C# / PowerShell expressions.
# stdin: one '<owned child PID> <reap milliseconds>' line, then EOF to close.
# stdout: ASSIGNED, CLOSED, or ERROR:<fixed stage>:<numeric native error> only.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if ($args.Count -ne 0) { [Console]::Out.WriteLine('ERROR:INPUT:0'); exit 2 }
try {
    Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;

public static class OfflineJobBroker {
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters {
        public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
    }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
        public BasicLimits Basic;
        public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential)] struct Accounting {
        public long UserTime, KernelTime, PeriodUserTime, PeriodKernelTime;
        public uint PageFaults, TotalProcesses, ActiveProcesses, TerminatedProcesses;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimits info, uint size);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool QueryInformationJobObject(IntPtr job, int infoClass, out Accounting info, uint size, IntPtr length);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern IntPtr OpenProcess(uint rights, bool inherit, int processId);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool TerminateJobObject(IntPtr job, uint exitCode);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

    static void Emit(string line) { Console.Out.WriteLine(line); Console.Out.Flush(); }
    static int Error(string stage, int code) {
        Emit("ERROR:" + stage + ":" + code.ToString(CultureInfo.InvariantCulture)); return 2;
    }
    public static int Run() {
        IntPtr job = IntPtr.Zero, process = IntPtr.Zero;
        try {
            string line = Console.In.ReadLine();
            if (line == null || line.Length > 32) return Error("INPUT", 0);
            string[] fields = line.Split(' ');
            int pid, reapMs;
            if (fields.Length != 2 || !Int32.TryParse(fields[0], NumberStyles.None, CultureInfo.InvariantCulture, out pid) ||
                !Int32.TryParse(fields[1], NumberStyles.None, CultureInfo.InvariantCulture, out reapMs) ||
                pid <= 0 || reapMs <= 0 || reapMs > 10000) return Error("INPUT", 0);
            job = CreateJobObject(IntPtr.Zero, null);
            if (job == IntPtr.Zero) return Error("CREATE", Marshal.GetLastWin32Error());
            ExtendedLimits limits = new ExtendedLimits();
            limits.Basic.Flags = 0x00002000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE; no breakaway flags.
            if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits))))
                return Error("LIMIT", Marshal.GetLastWin32Error());
            process = OpenProcess(0x00000101, false, pid); // SET_QUOTA | TERMINATE, never inheritable.
            if (process == IntPtr.Zero) return Error("OPEN", Marshal.GetLastWin32Error());
            if (!AssignProcessToJobObject(job, process)) return Error("ASSIGN", Marshal.GetLastWin32Error());
            CloseHandle(process); process = IntPtr.Zero;
            Emit("ASSIGNED");
            // Node alone holds the write side. Parent death or normal root exit
            // produces EOF; an unexpected command also closes the job in finally.
            if (Console.In.ReadLine() != null) return Error("INPUT", 0);
            // Terminate while retaining a query handle, then prove the job drained.
            // Closing this last handle also kills members on exception/broker death.
            if (!TerminateJobObject(job, 1)) return Error("TERMINATE", Marshal.GetLastWin32Error());
            Stopwatch watch = Stopwatch.StartNew();
            while (true) {
                Accounting accounting;
                if (!QueryInformationJobObject(job, 1, out accounting, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero))
                    return Error("QUERY", Marshal.GetLastWin32Error());
                if (accounting.ActiveProcesses == 0) break;
                if (watch.ElapsedMilliseconds >= reapMs) return Error("DRAIN", 0);
                Thread.Sleep(5);
            }
            CloseHandle(job); job = IntPtr.Zero;
            Emit("CLOSED");
            return 0;
        } finally {
            if (process != IntPtr.Zero) CloseHandle(process);
            if (job != IntPtr.Zero) CloseHandle(job);
        }
    }
}
'@
    exit [OfflineJobBroker]::Run()
} catch {
    # Never print exception text, compiler diagnostics, paths, or user input.
    [Console]::Out.WriteLine('ERROR:COMPILE:0')
    exit 2
}
