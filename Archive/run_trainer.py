import traceback

print("RUNNER: starting")

try:
    import fretboard_trainer
    print("RUNNER: module imported OK")
except Exception as e:
    print("RUNNER: import failed:", repr(e))
    traceback.print_exc()
    input("Press Enter to exit")
    raise SystemExit

print("RUNNER: calling main()")

try:
    fretboard_trainer.main()
except Exception as e:
    print("RUNNER: main() raised:", repr(e))
    traceback.print_exc()
    input("Press Enter to exit")
    raise SystemExit

print("RUNNER: finished")
input("Press Enter to exit")
