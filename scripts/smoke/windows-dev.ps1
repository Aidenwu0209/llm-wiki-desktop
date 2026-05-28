$ErrorActionPreference = "Stop"

Set-StrictMode -Version Latest

function Join-SmokePath {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Base,

        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]] $Children
    )

    $Path = $Base
    foreach ($Child in $Children) {
        $Path = Join-Path -Path $Path -ChildPath $Child
    }
    return $Path
}

function Write-SmokeLog {
    param([Parameter(Mandatory = $true)][string] $Message)

    $Line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ssK"), $Message
    Write-Host $Line
    Add-Content -LiteralPath $script:LogPath -Value $Line
}

function Resolve-SmokeExecutable {
    param([Parameter(Mandatory = $true)][string] $FileName)

    $Candidates = @($FileName)
    if ($env:OS -eq "Windows_NT" -and $FileName -eq "npm") {
        $Candidates = @("npm.cmd", "npm.exe", "npm")
    }

    foreach ($Candidate in $Candidates) {
        $Command = Get-Command $Candidate -ErrorAction SilentlyContinue
        if ($null -ne $Command) {
            return $Command.Source
        }
    }

    throw "Executable not found on PATH: $FileName"
}

function Invoke-SmokeCommand {
    param(
        [Parameter(Mandatory = $true)][string] $Label,
        [Parameter(Mandatory = $true)][string] $FileName,
        [string[]] $Arguments = @()
    )

    Write-SmokeLog "START $Label"
    $ResolvedFile = Resolve-SmokeExecutable -FileName $FileName
    Write-SmokeLog ("COMMAND {0} {1}" -f $ResolvedFile, ($Arguments -join " "))

    $SafeLabel = ($Label -replace '[^A-Za-z0-9_.-]', '-')
    $StdoutPath = Join-Path -Path $script:ArtifactDir -ChildPath "$SafeLabel.stdout.log"
    $StderrPath = Join-Path -Path $script:ArtifactDir -ChildPath "$SafeLabel.stderr.log"
    if (Test-Path -LiteralPath $StdoutPath) {
        Remove-Item -LiteralPath $StdoutPath -Force
    }
    if (Test-Path -LiteralPath $StderrPath) {
        Remove-Item -LiteralPath $StderrPath -Force
    }

    $Process = Start-Process `
        -FilePath $ResolvedFile `
        -ArgumentList $Arguments `
        -NoNewWindow `
        -Wait `
        -PassThru `
        -RedirectStandardOutput $StdoutPath `
        -RedirectStandardError $StderrPath

    if (Test-Path -LiteralPath $StdoutPath) {
        Get-Content -LiteralPath $StdoutPath | ForEach-Object { Add-Content -LiteralPath $script:LogPath -Value $_ }
    }
    if (Test-Path -LiteralPath $StderrPath) {
        Get-Content -LiteralPath $StderrPath | ForEach-Object { Add-Content -LiteralPath $script:LogPath -Value $_ }
    }

    Write-SmokeLog "END $Label exit=$($Process.ExitCode)"
    if ($Process.ExitCode -ne 0) {
        throw "$Label failed with exit code $($Process.ExitCode)"
    }
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$script:ArtifactDir = Join-SmokePath $RepoRoot "artifacts" "smoke" "windows"
New-Item -ItemType Directory -Path $script:ArtifactDir -Force | Out-Null

$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$script:LogPath = Join-Path -Path $script:ArtifactDir -ChildPath "smoke-windows-dev-$Timestamp.log"
New-Item -ItemType File -Path $script:LogPath -Force | Out-Null

Push-Location -LiteralPath $RepoRoot
try {
    Write-SmokeLog "repo=$RepoRoot"
    try {
        $Os = Get-CimInstance Win32_OperatingSystem
        Write-SmokeLog ("windows={0} version={1} build={2} arch={3}" -f $Os.Caption, $Os.Version, $Os.BuildNumber, $Os.OSArchitecture)
    } catch {
        Write-SmokeLog ("windows=$([System.Environment]::OSVersion.VersionString)")
    }

    Invoke-SmokeCommand -Label "node-version" -FileName "node" -Arguments @("--version")
    Invoke-SmokeCommand -Label "npm-version" -FileName "npm" -Arguments @("--version")
    Invoke-SmokeCommand -Label "rustc-version" -FileName "rustc" -Arguments @("--version")
    Invoke-SmokeCommand -Label "cargo-version" -FileName "cargo" -Arguments @("--version")
    Invoke-SmokeCommand -Label "git-commit" -FileName "git" -Arguments @("rev-parse", "HEAD")

    Invoke-SmokeCommand -Label "npm-ci" -FileName "npm" -Arguments @("ci")
    Invoke-SmokeCommand -Label "npm-test" -FileName "npm" -Arguments @("test")
    Invoke-SmokeCommand -Label "npm-run-build" -FileName "npm" -Arguments @("run", "build")

    $TauriDir = Join-Path -Path $RepoRoot -ChildPath "src-tauri"
    Push-Location -LiteralPath $TauriDir
    try {
        Invoke-SmokeCommand -Label "cargo-test" -FileName "cargo" -Arguments @("test")
    } finally {
        Pop-Location
    }

    Invoke-SmokeCommand -Label "npm-run-build-app" -FileName "npm" -Arguments @("run", "build:app")
    Write-SmokeLog "SMOKE STATUS passed"
} finally {
    Pop-Location
}
