import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

// Keep a Windows Job Object open for the entire command. Descendants inherit
// membership even if intermediate shells exit or children detach. Closing the
// supervisor kills the complete job; PID/name heuristics cannot do that safely.
const source = String.raw`
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
public static class ZyraShellSupervisor {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int kind, IntPtr information, uint length);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job, int kind, out Accounting information, uint length, IntPtr returnedLength);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [StructLayout(LayoutKind.Sequential)] struct Limits {
    public long processTime, jobTime;
    public uint flags;
    public UIntPtr minimumWorkingSet, maximumWorkingSet;
    public uint activeProcessLimit;
    public UIntPtr affinity;
    public uint priorityClass, schedulingClass;
  }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
    public Limits basic;
    public ulong readOperations, writeOperations, otherOperations, readBytes, writeBytes, otherBytes;
    public UIntPtr processMemory, jobMemory, peakProcessMemory, peakJobMemory;
  }
  [StructLayout(LayoutKind.Sequential)] struct Accounting {
    public long userTime, kernelTime, periodUserTime, periodKernelTime;
    public uint pageFaults, totalProcesses, activeProcesses, terminatedProcesses;
  }
  public static int Main(string[] args) {
    IntPtr job = IntPtr.Zero;
    Process shell = null;
    try {
      Process owner = Process.GetProcessById(int.Parse(args[1]));
      // A crashed/disconnected bridge must not strand its background job.
      var lifetime = new Thread(() => { owner.WaitForExit(); Environment.Exit(1); });
      lifetime.IsBackground = true;
      lifetime.Start();
      Console.InputEncoding = new UTF8Encoding(false);
      string command = Console.In.ReadToEnd();
      job = CreateJobObject(IntPtr.Zero, null);
      if (job == IntPtr.Zero) throw new InvalidOperationException("Could not create the command process job.");
      var limits = new ExtendedLimits();
      limits.basic.flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
      int size = Marshal.SizeOf(typeof(ExtendedLimits));
      IntPtr memory = Marshal.AllocHGlobal(size);
      try {
        Marshal.StructureToPtr(limits, memory, false);
        if (!SetInformationJobObject(job, 9, memory, (uint)size)) throw new InvalidOperationException("Could not configure command process cleanup.");
      } finally { Marshal.FreeHGlobal(memory); }
      shell = new Process();
      shell.StartInfo = new ProcessStartInfo(args[0], "-s") {
        UseShellExecute=false, CreateNoWindow=true,
        RedirectStandardInput=true, RedirectStandardOutput=true, RedirectStandardError=true,
        StandardOutputEncoding=new UTF8Encoding(false), StandardErrorEncoding=new UTF8Encoding(false)
      };
      shell.Start();
      // The shell is waiting for stdin. No command can spawn a child before it
      // belongs to the job, which removes the usual assignment race.
      if (!AssignProcessToJobObject(job, shell.Handle)) {
        shell.Kill();
        throw new InvalidOperationException("Could not own the command process tree.");
      }
      Task output = shell.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardOutput());
      Task error = shell.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
      // Preserve the tool's non-interactive stdin contract. Passing the script
      // straight through -s would let a program consume subsequent script lines.
      shell.StandardInput.Write("eval '" + command.Replace("'", "'\\''") + "' </dev/null\n");
      shell.StandardInput.Close();
      shell.WaitForExit();
      Accounting accounting;
      do {
        if (!QueryInformationJobObject(job, 1, out accounting, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero)) throw new InvalidOperationException("Could not track background command processes.");
        if (accounting.activeProcesses > 0) Thread.Sleep(25);
      } while (accounting.activeProcesses > 0);
      Task.WaitAll(output, error);
      return shell.ExitCode;
    } catch (Exception error) {
      Console.Error.WriteLine(error.Message);
      return 1;
    } finally {
      if (job != IntPtr.Zero) CloseHandle(job);
      if (shell != null) shell.Dispose();
    }
  }
}`;

let preparation;
export function prepareWindowsShellSupervisor() {
  return preparation ??= prepare().catch(error => { preparation = undefined; throw error; });
}

async function prepare() {
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 20);
  const directory = path.join(os.tmpdir(), 'zyra-shell-runtime');
  const executable = path.join(directory, `supervisor-${hash}.exe`);
  if (existsSync(executable)) return executable;
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `compile-${randomUUID()}.exe`);
  const quote = value => `'${value.replaceAll("'", "''")}'`;
  const script = `$ErrorActionPreference='Stop'; Add-Type -TypeDefinition ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(source).toString('base64')}'))) -OutputAssembly ${quote(temporary)} -OutputType ConsoleApplication`;
  try {
    await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15000 });
    try { await rename(temporary, executable); }
    catch (error) { if (!existsSync(executable)) throw error; }
    return executable;
  } finally { await rm(temporary, { force: true }); }
}
